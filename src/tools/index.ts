/**
 * Tool Exports Index
 * 
 * Centralized exports for all available tools (direct handlers)
 */

// Export direct tool handlers for use in MCP server and CLI
export { 
  RECOMMEND_TOOL_NAME, 
  RECOMMEND_TOOL_DESCRIPTION, 
  RECOMMEND_TOOL_INPUT_SCHEMA,
  handleRecommendTool
} from './recommend';

export { 
  CHOOSESOLUTION_TOOL_NAME, 
  CHOOSESOLUTION_TOOL_DESCRIPTION, 
  CHOOSESOLUTION_TOOL_INPUT_SCHEMA,
  handleChooseSolutionTool
} from './choose-solution';

export { 
  ANSWERQUESTION_TOOL_NAME, 
  ANSWERQUESTION_TOOL_DESCRIPTION, 
  ANSWERQUESTION_TOOL_INPUT_SCHEMA,
  handleAnswerQuestionTool
} from './answer-question';

export { 
  GENERATEMANIFESTS_TOOL_NAME, 
  GENERATEMANIFESTS_TOOL_DESCRIPTION, 
  GENERATEMANIFESTS_TOOL_INPUT_SCHEMA,
  handleGenerateManifestsTool
} from './generate-manifests';

export { 
  DEPLOYMANIFESTS_TOOL_NAME, 
  DEPLOYMANIFESTS_TOOL_DESCRIPTION, 
  DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA,
  handleDeployManifestsTool
} from './deploy-manifests';

export { 
  ORGANIZATIONAL_DATA_TOOL_NAME, 
  ORGANIZATIONAL_DATA_TOOL_DESCRIPTION, 
  ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA,
  handleOrganizationalDataTool
} from './organizational-data';