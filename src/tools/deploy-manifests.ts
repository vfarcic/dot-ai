/**
 * Deploy Manifests Tool - Apply Kubernetes manifests with readiness checking
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../core/validation';
import { DeployOperation } from '../core/deploy-operation';
import { InstructionLoader } from '../core/instruction-loader';

export const deployManifestsToolDefinition: ToolDefinition = {
  name: 'deployManifests',
  description: 'Deploy Kubernetes manifests from generated solution with kubectl apply --wait',
  inputSchema: MCPToolSchemas.DEPLOY_MANIFESTS_INPUT,
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'deployment',
  tags: ['kubernetes', 'deploy', 'apply', 'manifests', 'kubectl'],
  instructions: 'Deploy Kubernetes manifests from generated solution with kubectl apply --wait. Session directory is configured via DOT_AI_SESSION_DIR environment variable.'
};

export const deployManifestsToolHandler: ToolHandler = async (args: any, context: ToolContext) => {
  // Validate input arguments
  SchemaValidator.validateToolInput('deployManifests', args, MCPToolSchemas.DEPLOY_MANIFESTS_INPUT);

  const deployOp = new DeployOperation();
  
  const deployOptions = {
    solutionId: args.solutionId,
    timeout: args.timeout || 30
  };

  const result = await deployOp.deploy(deployOptions);

  // Return MCP-compatible response
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: result.success,
        solutionId: result.solutionId,
        manifestPath: result.manifestPath,
        readinessTimeout: result.readinessTimeout,
        message: result.message,
        kubectlOutput: result.kubectlOutput,
        // Additional deployment status info
        deploymentComplete: result.success && !result.readinessTimeout,
        requiresStatusCheck: result.success && result.readinessTimeout
      }, null, 2)
    }]
  };
};