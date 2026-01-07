/**
 * Investigation and AI provider constants
 * 
 * Centralized messages for AI investigation workflows, tool loops,
 * and provider-specific interactions.
 */

/**
 * Investigation workflow messages
 */
export const INVESTIGATION_MESSAGES = {
  /**
   * Message sent to AI when maximum investigation steps are reached
   * Used by both host-provider and vercel-provider to force final summary
   */
  WRAP_UP: 'You have reached the maximum number of investigation steps. Please provide your final summary NOW in the required JSON format based on all findings gathered so far. Do not request any more tool calls.',
  
  /**
   * Messages for investigation lifecycle
   */
  INVESTIGATION_START: 'Starting AI investigation with toolLoop',
  INVESTIGATION_COMPLETED: 'Investigation completed by toolLoop',
  INVESTIGATION_FAILED: 'Investigation failed',
  
  /**
   * Tool loop status messages
   */
  MAX_ITERATIONS_REACHED: 'Maximum investigation iterations reached',
  STARTING_TOOL_LOOP: 'Starting toolLoop with kubectl investigation tools',
  INVESTIGATION_AND_ANALYSIS_COMPLETED: 'Investigation and analysis completed'
} as const;

/**
 * Provider-specific messages
 */
export const PROVIDER_MESSAGES = {
  /**
   * Session management
   */
  SESSION_LOADED: 'Loaded session for choice execution',
  SESSION_NOT_FOUND: 'Session not found or expired',
  
  /**
   * Processing status
   */
  PROCESSING_REQUEST: 'Processing version tool request with system diagnostics',
  RUNNING_DIAGNOSTICS: 'Running system diagnostics...',
  DIAGNOSTICS_COMPLETED: 'System diagnostics completed'
} as const;