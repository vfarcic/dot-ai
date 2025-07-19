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
  SectionTestResult
} from './doc-testing-types';

export class DocTestingSessionManager {
  
  /**
   * Create a new validation session
   */
  createSession(filePath: string, args: any): ValidationSession {
    const sessionDir = getAndValidateSessionDirectory(args, true); // requireWrite=true
    const sessionId = this.generateSessionId();
    const reportFile = path.join(sessionDir, `doc-test-report-${sessionId}.md`);
    
    const session: ValidationSession = {
      sessionId,
      filePath,
      startTime: new Date().toISOString(),
      currentPhase: ValidationPhase.SCAN,
      status: SessionStatus.ACTIVE,
      reportFile,
      metadata: {
        totalSections: 0,
        completedSections: 0,
        sectionStatus: {},
        sessionDir,
        lastUpdated: new Date().toISOString()
      }
    };

    this.saveSession(session, args);
    this.initializeReport(session);
    
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
      const processedPrompt = template
        .replace(/\{filePath\}/g, session.filePath)
        .replace(/\{sessionId\}/g, session.sessionId)
        .replace(/\{phase\}/g, phase)
        .replace(/\{totalSections\}/g, session.metadata.totalSections.toString())
        .replace(/\{completedSections\}/g, session.metadata.completedSections.toString());
      
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

  private initializeReport(session: ValidationSession): void {
    const reportContent = `# Documentation Validation Report
    
**Session ID**: ${session.sessionId}
**File**: ${session.filePath}
**Started**: ${session.startTime}
**Status**: ${session.status}

## Progress Summary

- **Total Sections**: ${session.metadata.totalSections}
- **Completed Sections**: ${session.metadata.completedSections}
- **Remaining Sections**: ${session.metadata.totalSections - session.metadata.completedSections}

## Validation Items

_Items will be populated as they are discovered and tested._

---
*Last updated: ${session.metadata.lastUpdated}*
`;

    fs.writeFileSync(session.reportFile, reportContent);
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
      // All sections tested, move to analyze phase
      return {
        sessionId: session.sessionId,
        phase: ValidationPhase.ANALYZE,
        prompt: this.loadPhasePrompt(ValidationPhase.ANALYZE, session),
        nextPhase: ValidationPhase.FIX,
        nextAction: 'testDocs',
        instruction: 'Complete the analyze phase and submit your results to continue the workflow.',
        agentInstructions: this.getAgentInstructions(),
        workflow: {
          completed: [ValidationPhase.SCAN, ValidationPhase.TEST],
          current: ValidationPhase.ANALYZE,
          remaining: [ValidationPhase.FIX]
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
   * Store test results for a specific section
   */
  storeSectionTestResults(sessionId: string, sectionId: string, results: string, args: any): void {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Parse and validate JSON results
    let parsedResults: SectionTestResult;
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
    session.metadata.sectionStatus = sections.reduce((acc, section) => {
      acc[section.id] = SectionStatus.PENDING;
      return acc;
    }, {} as Record<string, SectionStatus>);

    // Move to test phase after processing scan results
    session.currentPhase = ValidationPhase.TEST;

    this.saveSession(session, args);
  }
}