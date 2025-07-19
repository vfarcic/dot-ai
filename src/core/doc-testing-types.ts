/**
 * Documentation Testing Types
 * 
 * Flexible TypeScript interfaces for the documentation testing system.
 * Designed to let AI agents dynamically identify and categorize testable content.
 */

/**
 * Main session object that tracks a documentation validation workflow
 */
export interface ValidationSession {
  sessionId: string;           // Unique identifier: "20250718-143052-a1b2c3d4"
  filePath: string;            // Path to the documentation file being tested
  startTime: string;           // ISO timestamp when session started
  currentPhase: ValidationPhase; // Current workflow phase
  status: SessionStatus;       // Overall session status
  reportFile: string;          // Path to the generated report file
  metadata: SessionMetadata;   // Counters and summary info
  
  // Section-based organization
  sections?: DocumentSection[]; // Document sections for validation
  sectionResults?: Record<string, SectionTestResult>; // Structured test results by section
}

/**
 * Session metadata with counters and summary information
 */
export interface SessionMetadata {
  // Section-level tracking
  totalSections: number;       // Total sections found in document
  completedSections: number;   // Sections that completed successfully
  sectionStatus: Record<string, SectionStatus>; // sectionId -> status
  
  sessionDir: string;          // Directory where session files are stored
  lastUpdated: string;         // ISO timestamp of last update
}



/**
 * The four phases of documentation validation workflow
 */
export enum ValidationPhase {
  SCAN = 'scan',      // Find all testable items in the documentation
  TEST = 'test',      // Execute tests on the found items
  ANALYZE = 'analyze', // Analyze results and categorize issues
  FIX = 'fix'         // Generate fixes for identified problems
}

/**
 * Overall status of a validation session
 */
export enum SessionStatus {
  ACTIVE = 'active',       // Session is currently being worked on
  COMPLETED = 'completed', // All phases completed successfully
  FAILED = 'failed',       // Session failed due to errors
  PAUSED = 'paused'        // Session temporarily paused
}


/**
 * Status of a document section during validation
 */
export enum SectionStatus {
  PENDING = 'pending',     // Section not yet processed
  SCANNING = 'scanning',   // Currently identifying testable items
  TESTING = 'testing',     // Currently executing validation items  
  ANALYZING = 'analyzing', // Currently analyzing test results
  FIXING = 'fixing',       // Currently generating fixes
  COMPLETED = 'completed', // Section validation completed successfully
  FAILED = 'failed'        // Section validation failed
}

/**
 * Logical section of a document for validation
 */
export interface DocumentSection {
  id: string;                    // Unique section identifier: "section_1", "section_2"
  title: string;                 // Human-readable section title: "Installation", "Getting Started"
}

/**
 * Structured test results for a section (JSON format from client agent)
 */
export interface SectionTestResult {
  whatWasDone: string;          // Summary of what was tested
  issues: string[];             // List of problems found
  recommendations: string[];    // List of improvement suggestions
}

/**
 * Workflow step returned by MCP interface to guide AI agents
 */
export interface WorkflowStep {
  sessionId: string;
  phase: ValidationPhase;
  prompt: string;              // AI prompt for this phase
  nextPhase?: ValidationPhase; // What phase comes next
  nextAction?: string;         // Next tool/action to call
  instruction?: string;        // Brief instruction for immediate next step
  agentInstructions?: string;  // Universal agent workflow instructions
  workflow: {
    completed: ValidationPhase[];
    current: ValidationPhase;
    remaining: ValidationPhase[];
  };
  data?: any;                  // Additional context data
}

/**
 * Phase-specific result tracking
 */
export interface PhaseResult {
  phase: ValidationPhase;
  startTime: string;
  endTime?: string;
  status: PhaseStatus;
  summary: string;
  nextPhase?: ValidationPhase;
  aiInsights?: string;         // AI-generated insights about this phase
}

/**
 * Status of a validation phase
 */
export enum PhaseStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress', 
  COMPLETED = 'completed',
  FAILED = 'failed'
}