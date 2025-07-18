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
}

/**
 * Session metadata with counters and summary information
 */
export interface SessionMetadata {
  totalItems: number;          // Total testable items found
  completedItems: number;      // Items that passed testing
  skippedItems: number;        // Items intentionally skipped
  blockedItems: number;        // Items that failed due to dependencies
  pendingItems: number;        // Items not yet tested
  sessionDir: string;          // Directory where session files are stored
  lastUpdated: string;         // ISO timestamp of last update
}

/**
 * Individual testable item found in documentation
 * AI agent decides what's testable and how to categorize it
 */
export interface ValidationItem {
  id: string;                  // Unique identifier for this item
  type: string;                // AI-determined type: "bash-command", "python-code", "file-exists", etc.
  category?: string;           // Optional grouping: "command", "code", "reference", etc.
  content: string;             // The actual content to test
  context?: string;            // Surrounding context for better understanding
  lineNumber?: number;         // Line number in the source file
  status: ItemStatus;          // Current status of this item
  dependencies: string[];      // Other item IDs this depends on
  metadata: Record<string, any>; // Flexible metadata for AI-specific needs
}

/**
 * Result of testing a validation item
 */
export interface TestResult {
  success: boolean;            // Did the test pass?
  output?: string;             // Command output or result details
  error?: string;              // Error message if failed
  duration: number;            // How long the test took (ms)
  metadata: Record<string, any>; // Additional result data
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
 * Status of individual validation items
 */
export enum ItemStatus {
  PENDING = 'pending',     // Not yet tested
  TESTING = 'testing',     // Currently being tested
  PASSED = 'passed',       // Test passed successfully
  FAILED = 'failed',       // Test failed
  SKIPPED = 'skipped',     // Intentionally skipped
  BLOCKED = 'blocked'      // Cannot test due to dependency failure
}

/**
 * Workflow step returned by MCP interface to guide AI agents
 */
export interface WorkflowStep {
  sessionId: string;
  phase: ValidationPhase;
  prompt: string;              // AI prompt for this phase
  nextPhase?: ValidationPhase; // What phase comes next
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
  items: ValidationItem[];
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