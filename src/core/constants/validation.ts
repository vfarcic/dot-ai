/**
 * Validation and error message constants
 * 
 * Centralized validation messages, error templates, and parameter
 * validation patterns used throughout the application.
 */

/**
 * Parameter validation messages
 */
export const VALIDATION_MESSAGES = {
  /**
   * Missing parameter error template
   * @param param - The name of the missing parameter
   */
  MISSING_PARAMETER: (param: string) => `Missing required parameter: ${param}`,
  
  /**
   * Missing parameter with context template  
   * @param param - The name of the missing parameter
   * @param context - Additional context (e.g., "search query", "filter")
   */
  MISSING_PARAMETER_WITH_CONTEXT: (param: string, context: string) => `Missing required parameter: ${param} (${context})`,
  
  /**
   * Invalid format error template
   * @param field - The field with invalid format
   */
  INVALID_FORMAT: (field: string) => `Invalid format for field: ${field}`,
  
  /**
   * Required field missing template
   * @param field - The required field that is missing
   */
  REQUIRED_FIELD: (field: string) => `Required field missing: ${field}`,
  
  /**
   * Validation failed template
   * @param reason - The reason validation failed
   */
  VALIDATION_FAILED: (reason?: string) => reason ? `Validation failed: ${reason}` : 'Validation failed',
  
  /**
   * Invalid input provided template
   * @param details - Details about the invalid input
   */
  INVALID_INPUT: (details?: string) => details ? `Invalid input provided: ${details}` : 'Invalid input provided'
} as const;