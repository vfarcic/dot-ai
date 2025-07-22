/**
 * Documentation Testing Session Manager
 * 
 * Handles creating, loading, saving, and managing documentation validation sessions.
 * Uses the existing session directory infrastructure from session-utils.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAndValidateSessionDirectory } from './session-utils';
import { 
  ValidationSession, 
  ValidationPhase, 
  SessionStatus, 
  WorkflowStep,
  DocumentSection,
  SectionStatus,
  SectionTestResult,
  FixableItem
} from './doc-testing-types';

export class DocTestingSessionManager {
  
  /**
   * Create a new validation session
   */
  createSession(filePath: string, args: any): ValidationSession {
    const sessionDir = getAndValidateSessionDirectory(args, true); // requireWrite=true
    const sessionId = this.generateSessionId();
    
    const session: ValidationSession = {
      sessionId,
      filePath,
      startTime: new Date().toISOString(),
      currentPhase: ValidationPhase.SCAN,
      status: SessionStatus.ACTIVE,
      metadata: {
        totalSections: 0,
        completedSections: 0,
        sectionStatus: {},
        nextItemId: 1,
        sessionDir,
        lastUpdated: new Date().toISOString()
      }
    };

    this.saveSession(session, args);
    
    return session;
  }

  /**
   * Load existing session
   */
  loadSession(sessionId: string, args: any): ValidationSession | null {
    const sessionDir = getAndValidateSessionDirectory(args, false); // requireWrite=false
    const sessionFile = path.join(sessionDir, `doc-test-${sessionId}.json`);
    
    if (!fs.existsSync(sessionFile)) {
      return null;
    }

    try {
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      return sessionData as ValidationSession;
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save session state
   */
  saveSession(session: ValidationSession, args: any): void {
    const sessionDir = getAndValidateSessionDirectory(args, true); // requireWrite=true
    session.metadata.lastUpdated = new Date().toISOString();
    
    const sessionFile = path.join(sessionDir, `doc-test-${session.sessionId}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  }


  /**
   * Get universal agent instructions for documentation testing workflow
   */
  private getAgentInstructions(): string {
    return `
DOCUMENTATION TESTING WORKFLOW:
1. Use the provided prompt to complete the requested task (scan, test section, analyze, or fix)
2. Return results in the exact format specified in the prompt
3. Submit results by calling testDocs with these parameters:
   - sessionId: the session ID provided in the response
   - results: your formatted results (JSON for section testing, JSON array for scan results)
   - sectionId: (only when testing individual sections) the specific section ID

RESULT SUBMISSION:
- Always include the sessionId when submitting results
- Include sectionId when testing individual sections  
- For section testing: use JSON format {"whatWasDone": "...", "issues": [...], "recommendations": [...]}
- For scan results: use JSON format {"sections": ["Section 1", "Section 2", ...]}
- After submitting, the system automatically provides the next step

WORKFLOW PHASES:
- scan: Identify testable sections → submit {"sections": [...]} JSON
- test: Test individual sections → submit {"whatWasDone": "...", "issues": [...], "recommendations": [...]} JSON
- analyze: Review all test results → submit analysis and recommendations
- fix: Apply fixes based on analysis → submit fix results

The system manages session state and workflow progression automatically.`;
  }

  /**
   * Get next workflow step for AI agent
   */
  getNextStep(sessionId: string, args: any, phaseOverride?: ValidationPhase): WorkflowStep | null {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      return null;
    }

    const targetPhase = phaseOverride || session.currentPhase;
    
    // Handle done phase - mark session as completed
    if (targetPhase === ValidationPhase.DONE) {
      return this.getDonePhaseStep(session, args);
    }
    
    // Handle section-by-section testing workflow
    if (targetPhase === ValidationPhase.TEST) {
      return this.getTestPhaseStep(session, args);
    }
    
    const prompt = this.loadPhasePrompt(targetPhase, session);
    const nextPhase = this.getNextPhase(targetPhase);

    return {
      sessionId,
      phase: targetPhase,
      prompt,
      nextPhase,
      nextAction: 'testDocs',
      instruction: `Complete the ${targetPhase} phase and submit your results to continue the workflow.`,
      agentInstructions: this.getAgentInstructions(),
      workflow: {
        completed: [],  // Will be populated when we add phase tracking
        current: targetPhase,
        remaining: this.getRemainingPhases(targetPhase)
      },
      data: {
        filePath: session.filePath,
        sessionDir: session.metadata.sessionDir
      }
    };
  }

  /**
   * Handle done phase - mark session as completed and provide summary
   */
  private getDonePhaseStep(session: ValidationSession, args: any): WorkflowStep {
    // Update session status to completed
    session.status = SessionStatus.COMPLETED;
    session.currentPhase = ValidationPhase.DONE;
    session.metadata.lastUpdated = new Date().toISOString();
    
    // Save the updated session
    this.saveSession(session, args);
    
    // Load and populate done phase prompt
    const prompt = this.loadPhasePrompt(ValidationPhase.DONE, session);

    return {
      sessionId: session.sessionId,
      phase: ValidationPhase.DONE,
      prompt,
      nextPhase: undefined, // No next phase - session is complete
      nextAction: undefined, // No next action required
      instruction: 'Documentation testing session completed successfully.',
      agentInstructions: 'This session is now complete. No further action is required.',
      workflow: {
        completed: [ValidationPhase.SCAN, ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX],
        current: ValidationPhase.DONE,
        remaining: []
      },
      data: {
        filePath: session.filePath,
        sessionDir: session.metadata.sessionDir,
        sessionComplete: true,
        summary: this.generateStatusSummary(session)
      }
    };
  }

  /**
   * Generate final session summary for done phase
   */
  private generateFinalSummary(session: ValidationSession): string {
    if (!session.sectionResults) {
      return "No test results available.";
    }

    // Count all items by status
    const allItems: FixableItem[] = [];
    Object.values(session.sectionResults).forEach(result => {
      allItems.push(...result.issues, ...result.recommendations);
    });

    if (allItems.length === 0) {
      return "✅ **No issues found** - Documentation appears to be in excellent condition!";
    }

    const statusCounts = {
      pending: allItems.filter(item => item.status === 'pending').length,
      fixed: allItems.filter(item => item.status === 'fixed').length,
      deferred: allItems.filter(item => item.status === 'deferred').length,
      failed: allItems.filter(item => item.status === 'failed').length
    };

    const total = allItems.length;
    let summary = `## Testing Results\n\n`;
    summary += `**Total Items Identified**: ${total}\n\n`;
    
    if (statusCounts.fixed > 0) {
      summary += `✅ **Successfully Fixed**: ${statusCounts.fixed} items\n`;
    }
    if (statusCounts.deferred > 0) {
      summary += `📋 **Deferred/Ignored**: ${statusCounts.deferred} items\n`;
    }
    if (statusCounts.pending > 0) {
      summary += `⏳ **Remaining for Future**: ${statusCounts.pending} items\n`;
    }
    if (statusCounts.failed > 0) {
      summary += `❌ **Fix Attempts Failed**: ${statusCounts.failed} items\n`;
    }

    const addressedItems = statusCounts.fixed + statusCounts.deferred;
    const completionRate = total > 0 ? Math.round((addressedItems / total) * 100) : 100;
    
    summary += `\n**Completion Rate**: ${completionRate}% (${addressedItems}/${total} items addressed)\n`;

    if (statusCounts.pending > 0 || statusCounts.failed > 0) {
      summary += `\n💡 **Next Steps**: Start a new testing session to address the remaining ${statusCounts.pending + statusCounts.failed} items.`;
    } else {
      summary += `\n🎉 **Excellent!** All identified items have been addressed.`;
    }

    return summary;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(args: any): ValidationSession[] {
    const sessionDir = getAndValidateSessionDirectory(args, false); // requireWrite=false
    const sessions: ValidationSession[] = [];
    
    if (!fs.existsSync(sessionDir)) {
      return sessions;
    }

    const files = fs.readdirSync(sessionDir);
    
    for (const file of files) {
      if (file.startsWith('doc-test-') && file.endsWith('.json')) {
        const sessionId = file.replace('doc-test-', '').replace('.json', '');
        const session = this.loadSession(sessionId, args);
        if (session && session.status === SessionStatus.ACTIVE) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  // Private helper methods

  private generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
  }

  /**
   * Load phase prompt from file (following CLAUDE.md pattern)
   */
  private loadPhasePrompt(phase: ValidationPhase, session: ValidationSession): string {
    const promptPath = path.join(process.cwd(), 'prompts', `doc-testing-${phase}.md`);
    
    if (!fs.existsSync(promptPath)) {
      // Fallback to basic prompt if file doesn't exist
      return `Read the file at "${session.filePath}" and process it for phase ${phase}.`;
    }

    try {
      const template = fs.readFileSync(promptPath, 'utf8');
      
      // Replace all template variables with actual values
      let processedPrompt = template
        .replace(/\{filePath\}/g, session.filePath)
        .replace(/\{sessionId\}/g, session.sessionId)
        .replace(/\{phase\}/g, phase)
        .replace(/\{totalSections\}/g, session.metadata.totalSections.toString())
        .replace(/\{completedSections\}/g, session.metadata.completedSections.toString());
      
      // Handle fix phase specific template variables
      if (phase === ValidationPhase.FIX) {
        const statusSummary = this.generateStatusSummary(session);
        const pendingItems = this.generatePendingItemsList(session);
        
        processedPrompt = processedPrompt
          .replace(/\{statusSummary\}/g, statusSummary)
          .replace(/\{pendingItems\}/g, pendingItems);
      }
      
      // Handle done phase specific template variables
      if (phase === ValidationPhase.DONE) {
        const finalSummary = this.generateFinalSummary(session);
        
        processedPrompt = processedPrompt
          .replace(/\{completionTime\}/g, session.metadata.lastUpdated)
          .replace(/\{finalSummary\}/g, finalSummary)
          .replace(/\{sessionDir\}/g, session.metadata.sessionDir);
      }
      
      // Check for unreplaced template variables
      const unreplacedVars = processedPrompt.match(/\{[^}]+\}/g);
      if (unreplacedVars) {
        console.error(`Warning: Unreplaced template variables in ${phase} prompt:`, unreplacedVars);
      }
      
      return processedPrompt;
    } catch (error) {
      console.error(`Failed to load prompt for phase ${phase}:`, error);
      return `Read the file at "${session.filePath}" and process it for phase ${phase}.`;
    }
  }

  private getNextPhase(currentPhase: ValidationPhase): ValidationPhase | undefined {
    const phases = [ValidationPhase.SCAN, ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX];
    const currentIndex = phases.indexOf(currentPhase);
    return currentIndex < phases.length - 1 ? phases[currentIndex + 1] : undefined;
  }

  private getRemainingPhases(currentPhase: ValidationPhase): ValidationPhase[] {
    const phases = [ValidationPhase.SCAN, ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX];
    const currentIndex = phases.indexOf(currentPhase);
    return phases.slice(currentIndex + 1);
  }



  /**
   * Update the status of a specific section
   */
  updateSectionStatus(sessionId: string, sectionId: string, status: SectionStatus, args: any): void {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.metadata.sectionStatus[sectionId] = status;
    
    // Update completed sections count
    session.metadata.completedSections = Object.values(session.metadata.sectionStatus)
      .filter(s => s === SectionStatus.COMPLETED).length;
      
    this.saveSession(session, args);
  }

  /**
   * Get sections for a session
   */
  getSections(sessionId: string, args: any): DocumentSection[] | null {
    const session = this.loadSession(sessionId, args);
    return session?.sections || null;
  }


  /**
   * Get the next test phase step - handles section-by-section testing
   */
  private getTestPhaseStep(session: ValidationSession, args: any): WorkflowStep {
    // If no sections available, fall back to regular test phase
    if (!session.sections || session.sections.length === 0) {
      const prompt = this.loadPhasePrompt(ValidationPhase.TEST, session);
      return {
        sessionId: session.sessionId,
        phase: ValidationPhase.TEST,
        prompt,
        nextPhase: ValidationPhase.ANALYZE,
        nextAction: 'testDocs',
        instruction: 'Complete the test phase and submit your results to continue the workflow.',
        agentInstructions: this.getAgentInstructions(),
        workflow: {
          completed: [],
          current: ValidationPhase.TEST,
          remaining: [ValidationPhase.ANALYZE, ValidationPhase.FIX]
        },
        data: {
          filePath: session.filePath,
          sessionDir: session.metadata.sessionDir
        }
      };
    }

    // Find the next section to test
    const nextSection = this.getNextSectionToTest(session);
    
    if (!nextSection) {
      // All sections tested, move to fix phase
      return {
        sessionId: session.sessionId,
        phase: ValidationPhase.FIX,
        prompt: this.loadPhasePrompt(ValidationPhase.FIX, session),
        nextPhase: undefined, // FIX is the final phase
        nextAction: 'testDocs',
        instruction: 'Present the pending items to the user for selection. Ask which fixes they want to apply. DO NOT auto-select or auto-defer items.',
        agentInstructions: this.getAgentInstructions(),
        workflow: {
          completed: [ValidationPhase.SCAN, ValidationPhase.TEST],
          current: ValidationPhase.FIX,
          remaining: []
        },
        data: {
          filePath: session.filePath,
          sessionDir: session.metadata.sessionDir,
          allSectionsTested: true
        }
      };
    }

    // Update section status to testing
    this.updateSectionStatus(session.sessionId, nextSection.id, SectionStatus.TESTING, args);
    
    const prompt = this.loadSectionTestPrompt(nextSection, session);
    const remainingSections = this.getRemainingTestSections(session);
    const nextPhase = remainingSections.length > 0 ? ValidationPhase.TEST : ValidationPhase.ANALYZE;
    
    return {
      sessionId: session.sessionId,
      phase: ValidationPhase.TEST,
      prompt,
      nextPhase,
      nextAction: 'testDocs',
      instruction: `Test the "${nextSection.title}" section and submit your results to continue the workflow.`,
      agentInstructions: this.getAgentInstructions(),
      workflow: {
        completed: [ValidationPhase.SCAN],
        current: ValidationPhase.TEST,
        remaining: remainingSections.length > 0 ? [ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX] : [ValidationPhase.ANALYZE, ValidationPhase.FIX]
      },
      data: {
        filePath: session.filePath,
        sessionDir: session.metadata.sessionDir,
        currentSection: nextSection,
        sectionsRemaining: remainingSections.length,
        totalSections: session.sections.length
      }
    };
  }

  /**
   * Find the next section that needs testing
   */
  private getNextSectionToTest(session: ValidationSession): DocumentSection | null {
    if (!session.sections) return null;
    
    // Find sections that are pending
    for (const section of session.sections) {
      const status = session.metadata.sectionStatus[section.id];
      
      // Skip if already tested or currently testing
      if (status === SectionStatus.COMPLETED || status === SectionStatus.TESTING) {
        continue;
      }
      
      // Return first pending section (no dependencies to check)
      return section;
    }
    
    return null;
  }


  /**
   * Get remaining sections that need testing
   */
  private getRemainingTestSections(session: ValidationSession): DocumentSection[] {
    if (!session.sections) return [];
    
    return session.sections.filter(section => {
      const status = session.metadata.sectionStatus[section.id];
      return status === SectionStatus.PENDING;
    });
  }

  /**
   * Load section-specific test prompt
   */
  private loadSectionTestPrompt(section: DocumentSection, session: ValidationSession): string {
    const promptPath = path.join(process.cwd(), 'prompts', 'doc-testing-test-section.md');
    
    if (!fs.existsSync(promptPath)) {
      // Fallback prompt
      return `Test the "${section.title}" section of ${session.filePath}.\n\nAnalyze this section and test everything you determine is testable within it.`;
    }

    try {
      const template = fs.readFileSync(promptPath, 'utf8');
      
      const processedPrompt = template
        .replace(/\{filePath\}/g, session.filePath)
        .replace(/\{sessionId\}/g, session.sessionId)
        .replace(/\{sectionId\}/g, section.id)
        .replace(/\{sectionTitle\}/g, section.title)
        .replace(/\{totalSections\}/g, session.sections?.length.toString() || '0')
        .replace(/\{sectionsRemaining\}/g, this.getRemainingTestSections(session).length.toString());
      
      // Check for unreplaced template variables
      const unreplacedVars = processedPrompt.match(/\{[^}]+\}/g);
      if (unreplacedVars) {
        console.error(`Warning: Unreplaced template variables in section test prompt:`, unreplacedVars);
      }
      
      return processedPrompt;
    } catch (error) {
      console.error(`Failed to load section test prompt:`, error);
      return `Test the "${section.title}" section of ${session.filePath}.`;
    }
  }

  /**
   * Convert string arrays to FixableItem arrays with generated IDs
   */
  private convertToFixableItems(items: string[] | FixableItem[], session: ValidationSession): FixableItem[] {
    return items.map((item) => {
      // If already a FixableItem object, return as-is
      if (typeof item === 'object' && item.id !== undefined) {
        return item as FixableItem;
      }
      
      // Convert string to FixableItem with generated ID
      const fixableItem: FixableItem = {
        id: session.metadata.nextItemId++,
        text: item as string,
        status: 'pending'
      };
      
      return fixableItem;
    });
  }

  /**
   * Store test results for a specific section
   */
  storeSectionTestResults(sessionId: string, sectionId: string, results: string, args: any): void {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Parse and validate JSON results
    let parsedResults: any; // Use 'any' initially to handle both old and new formats
    try {
      parsedResults = JSON.parse(results);
      
      // Validate required fields
      if (typeof parsedResults.whatWasDone !== 'string') {
        throw new Error('Missing or invalid "whatWasDone" field');
      }
      if (!Array.isArray(parsedResults.issues)) {
        throw new Error('Missing or invalid "issues" field - must be array');
      }
      if (!Array.isArray(parsedResults.recommendations)) {
        throw new Error('Missing or invalid "recommendations" field - must be array');
      }

      // Convert string arrays to FixableItem arrays if needed
      const processedResults: SectionTestResult = {
        whatWasDone: parsedResults.whatWasDone,
        issues: this.convertToFixableItems(parsedResults.issues, session),
        recommendations: this.convertToFixableItems(parsedResults.recommendations, session)
      };
      
      parsedResults = processedResults;
    } catch (error) {
      throw new Error(`Invalid JSON results format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Initialize sectionResults if it doesn't exist
    if (!session.sectionResults) {
      session.sectionResults = {};
    }

    // Store the parsed results
    session.sectionResults[sectionId] = parsedResults;

    // Update section status to completed
    if (session.metadata.sectionStatus[sectionId]) {
      session.metadata.sectionStatus[sectionId] = SectionStatus.COMPLETED;
      
      // Update completed sections count
      session.metadata.completedSections = Object.values(session.metadata.sectionStatus)
        .filter(status => status === SectionStatus.COMPLETED).length;
    }

    this.saveSession(session, args);
  }

  /**
   * Process scan results by converting section titles into DocumentSection objects
   */
  processScanResults(sessionId: string, sectionTitles: string[], args: any): void {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Convert section titles to DocumentSection objects and initialize status
    const sections: DocumentSection[] = sectionTitles.map((title, index) => ({
      id: `section_${index + 1}`,
      title: title.trim()
    }));

    // Update session with sections and reset counters
    session.sections = sections;
    session.metadata.totalSections = sections.length;
    session.metadata.completedSections = 0;
    session.metadata.nextItemId = 1; // Initialize ID counter for fix tracking
    session.metadata.sectionStatus = sections.reduce((acc, section) => {
      acc[section.id] = SectionStatus.PENDING;
      return acc;
    }, {} as Record<string, SectionStatus>);

    // Move to test phase after processing scan results
    session.currentPhase = ValidationPhase.TEST;

    this.saveSession(session, args);
  }

  /**
   * Generate status summary for fix phase
   */
  private generateStatusSummary(session: ValidationSession): string {
    if (!session.sectionResults) {
      return "No test results available.";
    }

    const allItems: FixableItem[] = [];
    
    // Collect all FixableItems from all sections
    Object.values(session.sectionResults).forEach(result => {
      allItems.push(...result.issues, ...result.recommendations);
    });

    if (allItems.length === 0) {
      return "No issues or recommendations found during testing.";
    }

    // Count by status
    const statusCounts = {
      pending: allItems.filter(item => item.status === 'pending').length,
      fixed: allItems.filter(item => item.status === 'fixed').length,
      deferred: allItems.filter(item => item.status === 'deferred').length,
      failed: allItems.filter(item => item.status === 'failed').length
    };

    const total = allItems.length;
    const remaining = statusCounts.pending + statusCounts.failed;

    let summary = `**Total Items**: ${total}\n`;
    if (statusCounts.fixed > 0) summary += `✅ **Fixed**: ${statusCounts.fixed}\n`;
    if (statusCounts.deferred > 0) summary += `📋 **Deferred**: ${statusCounts.deferred}\n`;
    if (remaining > 0) summary += `⏳ **Remaining**: ${remaining} (${statusCounts.pending} pending, ${statusCounts.failed} failed)\n`;
    
    if (remaining === 0) {
      summary += "\n🎉 All items have been addressed!";
    }

    return summary;
  }

  /**
   * Generate formatted list of pending/failed items for fix phase
   */
  private generatePendingItemsList(session: ValidationSession): string {
    if (!session.sectionResults) {
      return "No test results available.";
    }

    const pendingItems: FixableItem[] = [];
    const issues: FixableItem[] = [];
    const recommendations: FixableItem[] = [];
    
    // Collect all pending/failed items from all sections
    Object.values(session.sectionResults).forEach(result => {
      const pendingIssues = result.issues.filter(item => 
        item.status === 'pending' || item.status === 'failed'
      );
      const pendingRecs = result.recommendations.filter(item => 
        item.status === 'pending' || item.status === 'failed'
      );
      
      issues.push(...pendingIssues);
      recommendations.push(...pendingRecs);
      pendingItems.push(...pendingIssues, ...pendingRecs);
    });

    if (pendingItems.length === 0) {
      return "No pending items - all issues and recommendations have been addressed!";
    }

    let output = "";

    // Format issues section
    if (issues.length > 0) {
      output += "### Issues Found (Items requiring fixes)\n";
      issues.forEach(item => {
        const statusIndicator = item.status === 'failed' ? ' ❌ [RETRY]' : '';
        output += `${item.id}. ${item.text}${statusIndicator}\n`;
      });
      output += "\n";
    }

    // Format recommendations section  
    if (recommendations.length > 0) {
      output += "### Recommendations (Items suggesting improvements)\n";
      recommendations.forEach(item => {
        const statusIndicator = item.status === 'failed' ? ' ❌ [RETRY]' : '';
        output += `${item.id}. ${item.text}${statusIndicator}\n`;
      });
    }

    return output;
  }

  /**
   * Update the status of a specific FixableItem by ID
   */
  updateFixableItemStatus(
    sessionId: string, 
    itemId: number, 
    status: 'fixed' | 'deferred' | 'failed', 
    explanation?: string,
    args?: any
  ): void {
    const session = this.loadSession(sessionId, args || {});
    if (!session || !session.sectionResults) {
      throw new Error(`Session ${sessionId} not found or has no test results`);
    }

    let itemFound = false;

    // Search through all sections to find the item with the specified ID
    Object.values(session.sectionResults).forEach(result => {
      // Check issues
      const issueIndex = result.issues.findIndex(item => item.id === itemId);
      if (issueIndex !== -1) {
        result.issues[issueIndex].status = status;
        if (explanation) result.issues[issueIndex].explanation = explanation;
        itemFound = true;
        return;
      }

      // Check recommendations  
      const recIndex = result.recommendations.findIndex(item => item.id === itemId);
      if (recIndex !== -1) {
        result.recommendations[recIndex].status = status;
        if (explanation) result.recommendations[recIndex].explanation = explanation;
        itemFound = true;
        return;
      }
    });

    if (!itemFound) {
      throw new Error(`FixableItem with ID ${itemId} not found in session ${sessionId}`);
    }

    this.saveSession(session, args || {});
  }

  /**
   * Update multiple FixableItem statuses at once
   */
  updateMultipleFixableItemStatuses(
    sessionId: string,
    updates: Array<{
      itemId: number;
      status: 'fixed' | 'deferred' | 'failed';
      explanation?: string;
    }>,
    args?: any
  ): void {
    const session = this.loadSession(sessionId, args || {});
    if (!session || !session.sectionResults) {
      throw new Error(`Session ${sessionId} not found or has no test results`);
    }

    const notFoundItems: number[] = [];

    // Update each item
    updates.forEach(update => {
      let itemFound = false;

      Object.values(session.sectionResults!).forEach(result => {
        // Check issues
        const issueIndex = result.issues.findIndex(item => item.id === update.itemId);
        if (issueIndex !== -1) {
          result.issues[issueIndex].status = update.status;
          if (update.explanation) result.issues[issueIndex].explanation = update.explanation;
          itemFound = true;
          return;
        }

        // Check recommendations  
        const recIndex = result.recommendations.findIndex(item => item.id === update.itemId);
        if (recIndex !== -1) {
          result.recommendations[recIndex].status = update.status;
          if (update.explanation) result.recommendations[recIndex].explanation = update.explanation;
          itemFound = true;
          return;
        }
      });

      if (!itemFound) {
        notFoundItems.push(update.itemId);
      }
    });

    if (notFoundItems.length > 0) {
      throw new Error(`FixableItems with IDs not found: ${notFoundItems.join(', ')}`);
    }

    this.saveSession(session, args || {});
  }

  /**
   * Get all FixableItems with pending or failed status
   */
  getPendingFixableItems(sessionId: string, args?: any): FixableItem[] {
    const session = this.loadSession(sessionId, args || {});
    if (!session || !session.sectionResults) {
      return [];
    }

    const pendingItems: FixableItem[] = [];
    
    Object.values(session.sectionResults).forEach(result => {
      const pendingIssues = result.issues.filter(item => 
        item.status === 'pending' || item.status === 'failed'
      );
      const pendingRecs = result.recommendations.filter(item => 
        item.status === 'pending' || item.status === 'failed'
      );
      
      pendingItems.push(...pendingIssues, ...pendingRecs);
    });

    return pendingItems.sort((a, b) => a.id - b.id); // Sort by ID for consistent ordering
  }
}