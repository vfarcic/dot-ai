# API Reference

## Programmatic Usage

### Discovery Engine

```typescript
import { KubernetesDiscovery } from './src/core/discovery';

const discovery = new KubernetesDiscovery({ 
  kubeconfigPath: './kubeconfig.yaml' 
});

await discovery.connect();

// Discover all available resources
const resources = await discovery.getAPIResources();
console.log(`Found ${resources.length} resources`);

// Get cluster fingerprint
const fingerprint = await discovery.fingerprintCluster();
console.log(`Cluster: ${fingerprint.platform} v${fingerprint.version}`);

// Analyze resource schema
const podSchema = await discovery.explainResource('Pod');
console.log(`Pod has ${podSchema.fields.length} fields`);
```

### AI-Powered Recommendations

```typescript
import { ResourceRecommender, SolutionEnhancer } from './src/core/schema';

// Get AI-powered resource recommendations
const recommender = new ResourceRecommender({ claudeApiKey: 'your-key' });
const solutions = await recommender.findBestSolutions(
  'deploy a web application with scaling',
  () => discovery.discoverResources(),
  (resource) => discovery.explainResource(resource)
);

console.log(`Found ${solutions.length} solutions`);
console.log(`Best solution: ${solutions[0].description} (score: ${solutions[0].score})`);

// Enhance solution with user requirements
const enhancer = new SolutionEnhancer({ claudeApiKey: 'your-key' });
const enhancedSolution = await enhancer.enhanceSolution(
  solutions[0], 
  'I need it to handle 10x traffic',
  await discovery.discoverResources(),
  (resource) => discovery.explainResource(resource)
);

console.log('Enhanced solution with scaling configuration');
```

## TypeScript Interfaces

### Discovery Engine

```typescript
class KubernetesDiscovery {
  // Connection management
  async connect(): Promise<void>
  isConnected(): boolean
  
  // Resource discovery
  async getAPIResources(): Promise<EnhancedResource[]>
  async discoverCRDs(): Promise<EnhancedCRD[]>
  async discoverResources(): Promise<ResourceMap>
  
  // Schema introspection
  async explainResource(resource: string): Promise<ResourceExplanation>
  
  // Cluster analysis
  async getClusterInfo(): Promise<ClusterInfo>
  async fingerprintCluster(): Promise<ClusterFingerprint>
  
  // Configuration
  getKubeconfigPath(): string
  setKubeconfigPath(path: string): void
}
```

### Resource Recommendation

```typescript
class ResourceRecommender {
  constructor(config: AIRankingConfig)
  
  async findBestSolutions(
    intent: string,
    discoverResourcesFn: () => Promise<any>,
    explainResourceFn: (resource: string) => Promise<any>
  ): Promise<ResourceSolution[]>
}

interface ResourceSolution {
  id: string;
  type: 'single' | 'combination';
  resources: ResourceSchema[];
  score: number;
  description: string;
  reasons: string[];
  analysis: string;
  questions: QuestionGroup;
}
```

### Solution Enhancement

```typescript
class SolutionEnhancer {
  constructor(config: AIRankingConfig)
  
  async enhanceSolution(
    currentSolution: ResourceSolution,
    openResponse: string,
    availableResources: any,
    explainResource: (resource: string) => Promise<any>
  ): Promise<ResourceSolution>
}

interface QuestionGroup {
  required: Question[];
  basic: Question[];
  advanced: Question[];
  open: {
    question: string;
    placeholder: string;
    answer?: string;
  };
}
```

### Data Structures

```typescript
interface EnhancedResource {
  kind: string;
  group: string;
  version: string;
  apiVersion: string;
  namespaced: boolean;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
}

interface EnhancedCRD {
  name: string;
  group: string;
  version: string;
  kind: string;
  scope: 'Namespaced' | 'Cluster';
  versions: Array<{
    name: string;
    served: boolean;
    storage: boolean;
    schema?: any;
  }>;
}

interface ResourceExplanation {
  kind: string;
  version: string;
  group: string;
  description: string;
  fields: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
}

interface ClusterFingerprint {
  version: string;
  platform: string;
  nodes: {
    count: number;
    architecture: string[];
    operatingSystem: string[];
  };
  networking: {
    cni: string;
    serviceCIDR: string;
    podCIDR: string;
  };
  storage: {
    classes: string[];
    defaultClass: string;
  };
  features: string[];
  operators: string[];
}
```

## CLI Integration

### Building CLI Applications

```typescript
import { CliInterface } from './src/interfaces/cli';
import { AppAgent } from './src/core';

const appAgent = new AppAgent();
const cli = new CliInterface(appAgent);

// Execute commands programmatically
const result = await cli.executeCommand('discover', { 
  output: 'json' 
});

if (result.success) {
  console.log('Discovery results:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Custom Command Handling

```typescript
// Add custom command handling
cli.addCustomCommand('my-command', async (options) => {
  const discovery = new KubernetesDiscovery();
  await discovery.connect();
  
  // Custom logic here
  return {
    success: true,
    data: { message: 'Custom command executed' }
  };
});
```

## MCP Server Integration

### Starting MCP Server

```typescript
import { McpInterface } from './src/interfaces/mcp';

const mcpServer = new McpInterface();
await mcpServer.start();

// Server provides discovery capabilities as structured tools
// Compatible with Cursor, Claude Code, and other MCP clients
```

### MCP Tools Available

- `discover_resources`: Discover all cluster resources
- `explain_resource`: Get detailed resource schema
- `recommend_resources`: AI-powered resource recommendations  
- `enhance_solution`: Process user requirements to enhance configurations
- `fingerprint_cluster`: Analyze cluster capabilities

## Error Handling

### Common Error Patterns

```typescript
try {
  const discovery = new KubernetesDiscovery();
  await discovery.connect();
} catch (error) {
  if (error.message.includes('ENOTFOUND')) {
    console.error('Cannot connect to cluster - check kubeconfig');
  } else if (error.message.includes('Unauthorized')) {
    console.error('Authentication failed - check credentials');
  } else {
    console.error('Discovery failed:', error.message);
  }
}
```

### Graceful Degradation

```typescript
// Handle partial failures gracefully
const results = await discovery.discoverResources();

if (results.resources.length === 0) {
  console.warn('No standard resources found');
}

if (results.custom.length === 0) {
  console.warn('No custom resources found - limited operator support');
}

// Continue with available resources
```

## Enhancement Workflow

### Solution Enhancement Process

The enhancement workflow allows users to provide open-ended requirements that are processed to complete missing configuration values and add new capabilities to existing solutions.

#### Step 1: Get Initial Solution

```bash
# Get AI recommendations
node dist/cli.js recommend --intent "deploy a web application" > solution.json
```

#### Step 2: Add User Requirements

Edit the solution.json file to add your specific requirements to the `open.answer` field:

```json
{
  "type": "single",
  "score": 85,
  "description": "AppClaim deployment for web application",
  "questions": {
    "required": [
      {
        "id": "app-name", 
        "question": "What should we name your application?",
        "type": "text",
        "resourceMapping": {
          "resourceKind": "AppClaim",
          "apiVersion": "apiextensions.crossplane.io/v1",
          "fieldPath": "metadata.name"
        }
        // Note: No "answer" field yet
      }
    ],
    "open": {
      "question": "Any additional requirements?",
      "placeholder": "Enter details...",
      "answer": "I need this to handle 1000 requests per second with PostgreSQL database and auto-scaling"
    }
  }
}
```

#### Step 3: Enhance the Solution

```bash
# Process the user requirements
node dist/cli.js enhance --solution solution.json > enhanced-solution.json
```

#### Step 4: Review Enhanced Configuration

The enhanced solution will have:
- Completed answers for existing questions
- New questions for capabilities identified from user requirements  
- All new questions automatically answered based on user intent
- Open field cleared (ready for next enhancement cycle)

```json
{
  "type": "single", 
  "score": 85,
  "description": "AppClaim deployment for web application",
  "questions": {
    "required": [
      {
        "id": "app-name",
        "question": "What should we name your application?", 
        "type": "text",
        "answer": "high-performance-web-app",
        "resourceMapping": {
          "resourceKind": "AppClaim",
          "apiVersion": "apiextensions.crossplane.io/v1", 
          "fieldPath": "metadata.name"
        }
      }
    ],
    "basic": [
      {
        "id": "enable-scaling",
        "question": "Should auto-scaling be enabled?",
        "type": "boolean",
        "answer": true,
        "resourceMapping": {
          "resourceKind": "AppClaim",
          "apiVersion": "apiextensions.crossplane.io/v1",
          "fieldPath": "spec.parameters.scaling.enabled"
        }
      },
      {
        "id": "min-replicas", 
        "question": "What is the minimum number of replicas?",
        "type": "number",
        "answer": 3,
        "resourceMapping": {
          "resourceKind": "AppClaim",
          "apiVersion": "apiextensions.crossplane.io/v1",
          "fieldPath": "spec.parameters.scaling.minReplicas"
        }
      }
    ],
    "advanced": [
      {
        "id": "database-type",
        "question": "What type of database should be provisioned?",
        "type": "select",
        "options": ["postgresql", "mysql", "redis"],
        "answer": "postgresql",
        "resourceMapping": {
          "resourceKind": "AppClaim", 
          "apiVersion": "apiextensions.crossplane.io/v1",
          "fieldPath": "spec.parameters.database.engine"
        }
      }
    ],
    "open": {
      "question": "Any additional requirements?",
      "placeholder": "Enter details...",
      "answer": ""  // Cleared after processing
    }
  }
}
```

### Iterative Enhancement

The enhancement process can be repeated multiple times:

1. Add new requirements to the `open.answer` field
2. Run `enhance` command again
3. AI analyzes new requirements and adds/updates configuration
4. Review the updated solution

This allows for iterative refinement of the deployment configuration.

## Environment Configuration

### Required Environment Variables

```bash
# Optional: Custom kubeconfig location
export KUBECONFIG=/path/to/your/kubeconfig.yaml

# Required for AI features: Claude AI API key
export ANTHROPIC_API_KEY=your_api_key_here

# Optional: Debug logging
export DEBUG=app-agent:*
```

### Configuration Options

```typescript
interface DiscoveryConfig {
  kubeconfigPath?: string;
  timeout?: number;
  retries?: number;
  namespace?: string;
}

interface AIRankingConfig {
  claudeApiKey: string;
  model?: string;
  timeout?: number;
}
```