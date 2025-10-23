/**
 * TypeScript types and interfaces for Project Setup Tool
 * PRD #177 - Milestone 1: Core Tool Infrastructure
 *
 * Starting simple: Building iteratively based on actual workflow needs
 */

/**
 * Workflow steps for project setup
 */
export type ProjectSetupStep = 'discover' | 'reportScan' | 'generateFile' | 'complete';

/**
 * File status in the generation workflow
 */
export type FileStatus = 'excluded' | 'pending' | 'in-progress' | 'done';

/**
 * File information and state
 */
export interface FileInfo {
  status: FileStatus;
  scope?: string;  // Scope this file belongs to (e.g., 'readme', 'legal')
  answers?: Record<string, string>;
}

/**
 * Scope configuration structure
 */
export interface ScopeConfig {
  files: string[];
  questions: Question[];
  conditionalFiles?: Record<string, { condition: string; reason: string }>;
}

/**
 * Session data structure for maintaining workflow state
 */
export interface ProjectSetupSessionData {
  currentStep: ProjectSetupStep;
  allScopes?: Record<string, ScopeConfig>;  // All scope configurations
  selectedScopes?: string[];  // Scopes user chose to generate
  filesToCheck?: string[];  // All files from all scopes
  existingFiles?: string[];  // Files that exist in repository (stored after first reportScan)
  files?: Record<string, FileInfo>;  // Map of fileName -> FileInfo
}

/**
 * Discovery stage response - Step 1 of workflow
 */
export interface DiscoveryResponse {
  success: true;
  sessionId: string;
  filesToCheck: string[];
  availableScopes: string[];  // Available scopes (e.g., ['readme', 'legal'])
  nextStep: 'reportScan';
  instructions: string;
}

/**
 * Report scan response - Step 2 of workflow
 * Returns when user selects files to generate
 */
export interface ReportScanResponse {
  success: true;
  sessionId: string;
  nextStep: 'generateFile';
  instructions: string;
  // If scopes were selected, return questions for first file
  currentFile?: string;
  questions?: Question[];
}

/**
 * Generate file response - Step 3 of workflow
 * Includes preview of next file's questions to reduce round trips
 */
export interface GenerateFileResponse {
  success: true;
  sessionId: string;
  fileName: string;
  content: string;
  instructions: string;
  // Preview of next file (if any) to enable batch processing
  nextFile?: {
    fileName: string;
    scope: string;
    questions: Question[];
  };
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    details?: string;
  };
}

/**
 * Question definition for gathering project information
 */
export interface Question {
  id: string;
  question: string;
  required: boolean;
}

/**
 * Tool input parameters
 */
export interface ProjectSetupParams {
  step?: ProjectSetupStep;
  sessionId?: string;

  // reportScan parameters
  existingFiles?: string[];
  selectedScopes?: string[];  // Scopes user chose to setup (e.g., ['readme', 'legal'])

  // generateFile parameters
  fileName?: string;
  answers?: Record<string, string>;
  completedFileName?: string;  // Confirmation that file was created
  nextFileAnswers?: Record<string, string>;  // Optional answers for next file (reduces round trips)
}

/**
 * Tool response type
 */
export type ProjectSetupResponse = DiscoveryResponse | ReportScanResponse | GenerateFileResponse | ErrorResponse;
