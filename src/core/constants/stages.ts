/**
 * Stage-specific messages and instructions
 * 
 * Messages used in question answering, configuration stages,
 * and user guidance throughout different workflow phases.
 */

/**
 * Configuration stage messages
 */
export const STAGE_MESSAGES = {
  /**
   * Stage-specific instructions
   */
  REQUIRED_INSTRUCTIONS: 'STAGE: REQUIRED - Present ALL questions to the user and collect answers. All questions must be answered before proceeding.',
  BASIC_INSTRUCTIONS: 'STAGE: BASIC - Present ALL questions to the user. Show defaults where available but ask user to confirm or change each one. User must review all questions before proceeding.',
  ADVANCED_INSTRUCTIONS: 'STAGE: ADVANCED - Present ALL questions to the user. Show defaults where available but ask user to confirm or change each one. User must review all questions before proceeding to advanced stage.',
  ADVANCED_INSTRUCTIONS_HELM: 'STAGE: ADVANCED - Present ALL questions to the user. Show defaults where available but ask user to confirm or change each one. User must review all questions before proceeding to manifest generation.',
  OPEN_INSTRUCTIONS: 'STAGE: OPEN - Ask user for any additional requirements or constraints. User can say "N/A" if none.',
  
  /**
   * User-facing stage messages
   */
  REQUIRED_MESSAGE: 'Please answer the required configuration questions.',
  BASIC_MESSAGE: 'Would you like to configure basic settings?',
  ADVANCED_MESSAGE: 'Would you like to configure advanced features?',
  OPEN_MESSAGE: 'Any additional requirements or constraints?',
  
  /**
   * Stage guidance
   */
  REQUIRED_GUIDANCE: 'Present all required questions to the user. All must be answered to proceed.',
  BASIC_GUIDANCE: 'Present all basic questions to the user. Show default values as suggestions but ask user to confirm each one.',
  ADVANCED_GUIDANCE: 'Present all advanced questions to the user. Show default values as suggestions but ask user to confirm each one. After this stage: open stage.',
  ADVANCED_GUIDANCE_HELM: 'Present all advanced questions to the user. Show default values as suggestions but ask user to confirm each one. After this stage: manifest generation.',
  OPEN_GUIDANCE: 'Ask user for any additional requirements or constraints. User can say "N/A" if none.',
  DEFAULT_GUIDANCE: 'Present all questions to the user and collect their responses.'
} as const;

/**
 * User interface and interaction messages
 */
export const UI_MESSAGES = {
  /**
   * Common prompts
   */
  CONTINUE_PROMPT: 'Would you like to continue?',
  RETRY_PROMPT: 'Would you like to retry?',
  CONFIRM_PROMPT: 'Please confirm your selection',
  
  /**
   * Loading and progress
   */
  LOADING: 'Loading...',
  PROCESSING: 'Processing your request...',
  PLEASE_WAIT: 'Please wait...',
  
  /**
   * Help and guidance
   */
  HELP_AVAILABLE: 'Type "help" for assistance',
  NO_ADDITIONAL_CONFIG: 'No additional configuration required',
  DEFAULT_VALUE_SUGGESTED: 'Default value suggested'
} as const;

/**
 * Workflow completion messages
 */
export const COMPLETION_MESSAGES = {
  /**
   * Workflow success
   */
  WORKFLOW_COMPLETE: 'Workflow completed successfully',
  CONFIGURATION_COMPLETE: 'Configuration completed successfully',
  SETUP_COMPLETE: 'Setup completed successfully',
  
  /**
   * Next steps
   */
  READY_FOR_DEPLOYMENT: 'Ready for deployment',
  READY_FOR_NEXT_STAGE: 'Ready to proceed to next stage',
  AWAITING_USER_INPUT: 'Awaiting user input'
} as const;