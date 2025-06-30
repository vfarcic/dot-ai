/**
 * Can Help Tool - Check if App-Agent can assist with deployment requests
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { JSONSchema } from '../core/validation';

const CAN_HELP_INPUT: JSONSchema = {
  type: 'object',
  properties: {
    request: {
      type: 'string',
      description: 'Describe what you want to do (e.g., "create an app", "deploy something", "setup infrastructure")',
      minLength: 1,
      maxLength: 500
    }
  },
  required: ['request']
};

const CAN_HELP_OUTPUT: JSONSchema = {
  type: 'object',
  properties: {
    content: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['text'] },
          text: { type: 'string', minLength: 1 }
        },
        required: ['type', 'text']
      }
    }
  },
  required: ['content']
};

export const canHelpToolDefinition: ToolDefinition = {
  name: 'can_help',
  description: 'Check if App-Agent can help with your deployment, application creation, or infrastructure request. Use this when unsure if App-Agent is the right tool for: deploying apps, creating services, setting up databases, building infrastructure, running containers, or any Kubernetes-related tasks.',
  inputSchema: CAN_HELP_INPUT,
  outputSchema: CAN_HELP_OUTPUT,
  version: '1.0.0',
  category: 'discovery',
  tags: ['help', 'discovery', 'routing', 'can', 'deploy', 'create', 'app', 'application', 'infrastructure', 'kubernetes']
};

export const canHelpToolHandler: ToolHandler = async (args: any, context: ToolContext) => {
  const { requestId, logger } = context;
  
  logger.debug('Handling can_help request', { requestId, request: args?.request });

  // Keywords that indicate App-Agent can help
  const deploymentKeywords = [
    'deploy', 'create', 'run', 'setup', 'launch', 'build', 'install', 'start',
    'app', 'application', 'service', 'api', 'database', 'web', 'site', 'server',
    'microservice', 'container', 'docker', 'kubernetes', 'k8s', 'cluster',
    'infrastructure', 'stack', 'environment', 'pipeline', 'workflow',
    'redis', 'mongodb', 'postgres', 'mysql', 'nginx', 'apache', 'node',
    'python', 'java', 'react', 'vue', 'angular', 'frontend', 'backend'
  ];

  const request = (args.request || '').toLowerCase();
  const canHelp = deploymentKeywords.some(keyword => request.includes(keyword));

  let response: string;
  let suggestedTool: string = '';

  if (canHelp) {
    response = `🎯 **Yes, App-Agent can help!** 

Your request "${args.request}" appears to be related to deployment or application setup, which is exactly what App-Agent specializes in.

**Recommended Workflow:**
1. **First**, ask the user to describe in more detail what type of application they want to deploy
2. **Then**, use the \`recommend\` tool with their description as the "intent" parameter

**Example:** 
- Ask: "What type of application would you like to create/deploy?" 
- User responds: "A Node.js API with Redis cache"
- Use: \`recommend\` with intent: "deploy a Node.js API with Redis cache"`;
    
    suggestedTool = 'recommend';
  } else {
    response = `ℹ️ **App-Agent might not be the best fit**

Your request "${args.request}" doesn't clearly indicate a deployment or application setup task.

**App-Agent specializes in:**
- Deploying applications to Kubernetes
- Setting up databases and services  
- Creating web applications and APIs
- Building infrastructure and CI/CD pipelines
- Containerized application deployment

**If you want to deploy something, try being more specific:**
- "deploy a web application"
- "create a database cluster" 
- "setup a Redis cache"
- "run a Python API"`;
  }

  logger.info('Can_help assessment completed', {
    requestId,
    canHelp,
    suggestedTool,
    request: args.request
  });

  return {
    content: [{
      type: 'text',
      text: response
    }]
  };
};