/**
 * TypeScript types and interfaces for Project Setup Tool
 * PRD #177 - Milestone 1: Core Tool Infrastructure
 *
 * Starting simple: Building iteratively based on actual workflow needs
 */

/**
 * Workflow steps for project setup
 */
export type ProjectSetupStep = 'discover' | 'reportScan' | 'generateScope' | 'complete';

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
 * Returns all questions for selected scope(s)
 */
export interface ReportScanResponse {
  success: true;
  sessionId: string;
  nextStep: 'generateScope';
  instructions: string;
  scope: string;  // The scope being generated
  questions: Question[];  // ALL questions for this scope
  filesToGenerate: string[];  // List of files that will be generated in this scope
}

/**
 * Generated file content
 */
export interface GeneratedFile {
  path: string;  // File path (e.g., '.github/CODEOWNERS')
  content: string;  // File content
  reason?: string;  // Why this file is being generated
}

/**
 * Generate scope response - Step 3 of workflow
 * Returns contents of ALL files in the scope at once
 */
export interface GenerateScopeResponse {
  success: true;
  sessionId: string;
  scope: string;
  files: GeneratedFile[];  // Array of all generated files
  excludedFiles?: string[];  // Files that were excluded (e.g., FUNDING.yml when enableFunding=no)
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
  selectedScopes?: string[];  // Scopes user chose to setup (e.g., ['readme', 'legal', 'github-community'])

  // generateScope parameters
  scope?: string;  // The scope to generate (e.g., 'github-community')
  answers?: Record<string, string>;  // Answers to ALL questions for this scope
}

/**
 * Tool response type
 */
export type ProjectSetupResponse = DiscoveryResponse | ReportScanResponse | GenerateScopeResponse | ErrorResponse;
