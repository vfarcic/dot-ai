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

### AI-Powered Recommendations (Legacy - Use MCP Tools)

**Note: Direct programmatic access is available but the recommended approach is via MCP tools for conversational workflows.**

```typescript
import { ResourceRecommender } from './src/core/schema';

// Get AI-powered resource recommendations (legacy approach)
const recommender = new ResourceRecommender({ claudeApiKey: 'your-key' });
const solutions = await recommender.findBestSolutions(
  'deploy a web application with scaling',
  () => discovery.discoverResources(),
  (resource) => discovery.explainResource(resource)
);

console.log(`Found ${solutions.length} solutions`);
console.log(`Best solution: ${solutions[0].description} (score: ${solutions[0].score})`);

// For interactive deployment, use MCP tools:
// recommend → chooseSolution → answerQuestion → generateManifests
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

### Stage-Based Workflow (Current)

```typescript
// New stage-based workflow via MCP tools:
// 1. recommend: Get solutions
// 2. chooseSolution: Select preferred solution  
// 3. answerQuestion: Progressive configuration (required → basic → advanced → open)
// 4. generateManifests: AI-generated Kubernetes YAML

// Legacy SolutionEnhancer (see /src/legacy/ directory for reference)
```

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
import { DotAI } from './src/core';

const dotAI = new DotAI();
const cli = new CliInterface(dotAI);

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

**Stage-Based Deployment Workflow:**
- `recommend`: AI-powered resource recommendations based on intent
- `chooseSolution`: Select a solution and get configuration questions
- `answerQuestion`: Answer configuration questions progressively by stage
- `generateManifests`: Generate final Kubernetes YAML manifests

**Cluster Discovery:**
- `discover_resources`: Discover all cluster resources
- `explain_resource`: Get detailed resource schema
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

## Stage-Based Deployment Workflow

### Interactive Deployment Process

The new stage-based workflow provides a conversational approach to application deployment through progressive question answering.

#### Step 1: Get AI Recommendations

```bash
# Start MCP server
npm run mcp:start

# Use MCP tools for conversational workflow
# recommend: Get AI-powered deployment recommendations
```

**MCP Tool**: `recommend`
```typescript
// Via MCP client (Claude Code, Cursor, etc.)
recommend({
  intent: "deploy a web application with database"
})
// Returns: Array of ranked solutions with scores and descriptions
```

#### Step 2: Choose Solution

```typescript
// Select your preferred solution
chooseSolution({
  solutionId: "sol_2025-07-01T123456_abc123def456"
})
// Returns: Configuration questions for the selected solution
```

#### Step 3: Progressive Configuration

Answer questions in stages to build your deployment configuration:

**Required Stage:**
```typescript
answerQuestion({
  solutionId: "sol_2025-07-01T123456_abc123def456",
  stage: "required",
  answers: {
    "name": "my-web-app",
    "namespace": "production",
    "image": "nginx:1.21",
    "replicas": 3
  }
})
```

**Basic Stage:**
```typescript
answerQuestion({
  solutionId: "sol_2025-07-01T123456_abc123def456", 
  stage: "basic",
  answers: {
    "port": 8080,
    "service-type": "ClusterIP",
    "storage-size": "10Gi"
  }
})
```

**Advanced Stage:**
```typescript
answerQuestion({
  solutionId: "sol_2025-07-01T123456_abc123def456",
  stage: "advanced", 
  answers: {
    "scaling-enabled": true,
    "resource-requests-cpu": "500m",
    "resource-requests-memory": "512Mi"
  }
})
```

**Open Requirements:**
```typescript
answerQuestion({
  solutionId: "sol_2025-07-01T123456_abc123def456",
  stage: "open",
  answers: {
    "open": "I need PostgreSQL database with 1000 RPS capacity and SSL termination"
  }
})
```

#### Step 4: Generate Manifests

```typescript
generateManifests({
  solutionId: "sol_2025-07-01T123456_abc123def456"
})
// Returns: Production-ready Kubernetes YAML manifests
```

### Benefits of Stage-Based Approach

**Progressive Disclosure:**
- Questions presented in logical order (required → basic → advanced → open)
- Users can skip stages they don't need to configure
- No overwhelming JSON construction required

**Better Error Recovery:**
- Clear guidance at each stage
- Validation happens per stage
- Easy to retry with corrections

**Conversational Flow:**
- Natural interaction pattern
- AI can provide context and suggestions
- Supports iterative refinement through open requirements

### Session Management

Each deployment session is identified by a unique `solutionId` that maintains state across the workflow:

```typescript
// Session data stored in DOT_AI_SESSION_DIR
// Contains solution configuration, answers, and generated manifests
// Enables resuming interrupted workflows
```

## Environment Configuration

### Required Environment Variables

```bash
# Optional: Custom kubeconfig location
export KUBECONFIG=/path/to/your/kubeconfig.yaml

# Required for AI features: Claude AI API key
export ANTHROPIC_API_KEY=your_api_key_here

# Optional: Debug logging
export DEBUG=dot-ai:*
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