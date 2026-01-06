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
  BASIC_INSTRUCTIONS: 'STAGE: BASIC - Present ALL questions to the user. Show defaults where available but ask user to confirm or change each one. User must review all questions before proceeding to advanced stage.',
  ADVANCED_INSTRUCTIONS: 'STAGE: ADVANCED - Present ALL questions to the user. Show defaults where available but ask user to confirm or change each one. User must review all questions before proceeding to open stage.',
  ADVANCED_INSTRUCTIONS_HELM: 'STAGE: ADVANCED - Present ALL questions to the user. Show defaults where available but ask user to confirm or change each one. User must review all questions before proceeding to manifest generation.',
  OPEN_INSTRUCTIONS: 'STAGE: OPEN - Final configuration stage. Ask user for any additional requirements or constraints. User can say "N/A" if none.',
  UNKNOWN_INSTRUCTIONS: 'STAGE: UNKNOWN - Present questions to the user and wait for their response.',
  
  /**
   * User-facing stage messages
   */
  REQUIRED_MESSAGE: 'Please answer the required configuration questions.',
  BASIC_MESSAGE: 'Would you like to configure basic settings?',
  ADVANCED_MESSAGE: 'Would you like to configure advanced features?',
  OPEN_MESSAGE: 'Any additional requirements or constraints?',
  UNKNOWN_MESSAGE: 'Configuration stage unknown.',
  
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