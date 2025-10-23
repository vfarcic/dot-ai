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
  answers?: Record<string, string>;
}

/**
 * Session data structure for maintaining workflow state
 */
export interface ProjectSetupSessionData {
  currentStep: ProjectSetupStep;
  questions?: Question[];
  filesToCheck?: string[];  // From discovery config
  files?: Record<string, FileInfo>;  // Map of fileName -> FileInfo
}

/**
 * Discovery stage response - Step 1 of workflow
 */
export interface DiscoveryResponse {
  success: true;
  sessionId: string;
  filesToCheck: string[];
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
  existingFiles: string[];
  missingFiles: string[];
  nextStep: 'generateFile';
  instructions: string;
  // If files were selected, return questions for first file
  currentFile?: string;
  questions?: Question[];
}

/**
 * Generate file response - Step 3 of workflow
 */
export interface GenerateFileResponse {
  success: true;
  sessionId: string;
  fileName: string;
  content: string;
  instructions: string;
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
  selectedFiles?: string[];  // Files user chose to generate

  // generateFile parameters
  fileName?: string;
  answers?: Record<string, string>;
  completedFileName?: string;  // Confirmation that file was created
}

/**
 * Tool response type
 */
export type ProjectSetupResponse = DiscoveryResponse | ReportScanResponse | GenerateFileResponse | ErrorResponse;
