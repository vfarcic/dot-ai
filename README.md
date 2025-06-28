# App-Agent

An intelligent Kubernetes application deployment agent that discovers cluster capabilities and helps construct applications using available resources.

## Overview

App-Agent is a TypeScript-based tool that combines AI-powered application understanding with comprehensive Kubernetes cluster discovery to intelligently deploy applications. It analyzes your cluster's capabilities, available resources, and custom operators to construct optimal deployment strategies.

## Features

### 🔍 **Comprehensive Cluster Discovery**
- **API Resource Discovery**: Discovers all available Kubernetes resources across all API groups
- **Custom Resource Detection**: Identifies installed operators and their capabilities through CRD analysis
- **Schema Introspection**: Provides detailed field-level schema information for any resource
- **Cluster Fingerprinting**: Analyzes cluster capabilities, networking, security, and storage configuration
- **Enhanced Error Handling**: Provides actionable troubleshooting guidance for connectivity and permission issues

### 🤖 **AI-Powered Application Construction**
- **Intelligent Resource Selection**: Uses cluster discovery data to select appropriate resources for your application
- **Operator Integration**: Automatically detects and leverages custom operators when available
- **Graceful Degradation**: Falls back to standard resources when advanced features aren't available
- **Context-Aware Deployment**: Adapts deployment strategies based on cluster size, security policies, and available features

### 🛠 **Developer Experience**
- **Multiple Interfaces**: CLI for direct usage, MCP server for tool integration
- **TypeScript Support**: Fully typed interfaces for all discovery data structures
- **Comprehensive Testing**: 247+ tests with real cluster integration testing
- **Flexible Configuration**: Supports multiple kubeconfig scenarios and authentication methods

## Quick Start

### Prerequisites
- Node.js 18+ 
- kubectl configured with cluster access
- TypeScript (for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/app-agent.git
cd app-agent

# Install dependencies
npm install

# Build the project
npm run build
```

### Basic Usage

```bash
# Discover cluster resources
node dist/cli.js discover --output table

# Discover with custom kubeconfig
node dist/cli.js discover --kubeconfig ./my-config.yaml --output json

# Get detailed resource schema
node dist/cli.js explain Pod

# Analyze cluster capabilities
node dist/cli.js fingerprint
```

### Programmatic Usage

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

## Architecture

### Core Components

- **Discovery Engine** (`src/core/discovery.ts`): Comprehensive Kubernetes cluster discovery and analysis
- **AI Integration** (`src/core/claude.ts`): Claude AI integration for intelligent application construction
- **Memory System** (`src/core/memory.ts`): Persistent memory for learning and context retention
- **Workflow Engine** (`src/core/workflow.ts`): Orchestrates the application construction process
- **CLI Interface** (`src/interfaces/cli.ts`): Command-line interface for direct usage
- **MCP Interface** (`src/interfaces/mcp.ts`): Model Context Protocol server for tool integration

### Data Structures

The discovery engine provides comprehensive, unfiltered data through well-defined TypeScript interfaces:

- **`EnhancedResource`**: Standard Kubernetes resources with metadata
- **`EnhancedCRD`**: Custom Resource Definitions with version and schema info
- **`ResourceExplanation`**: Detailed field-level schema information
- **`ClusterFingerprint`**: Comprehensive cluster capabilities and configuration
- **`ResourceMap`**: Container for all discovered resources

📖 **[Complete Discovery Engine Documentation](docs/discovery-engine.md)**

## Configuration

### Kubeconfig Resolution

App-Agent automatically resolves kubeconfig paths in priority order:

1. **Custom path** provided via `--kubeconfig` flag or constructor
2. **KUBECONFIG environment variable** (first path if multiple)
3. **Default path** (`~/.kube/config`)

### Environment Variables

```bash
# Optional: Custom kubeconfig location
export KUBECONFIG=/path/to/your/kubeconfig.yaml

# Optional: Claude AI API key (for AI features)
export ANTHROPIC_API_KEY=your_api_key_here
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test suite
npm test -- tests/core.test.ts
```

### Development Workflow

1. **Make changes** to source files in `src/`
2. **Build** the project: `npm run build`
3. **Run tests** to ensure functionality: `npm test`
4. **Test manually** with real cluster: `node dist/cli.js discover --kubeconfig kubeconfig.yaml`
5. **Commit changes** with descriptive messages

### Test Coverage

The project maintains comprehensive test coverage:
- **Unit Tests**: Core functionality and error conditions
- **Integration Tests**: Real cluster connectivity using kind cluster
- **TDD Tests**: Error handling and graceful degradation scenarios
- **Manual Validation**: CLI output verification and data structure validation

Current coverage: **69%+ overall** with **247+ tests** across 6 test suites.

## API Reference

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

### CLI Commands

```bash
# Discovery commands
app-agent discover [--kubeconfig PATH] [--output FORMAT]
app-agent explain RESOURCE [--field FIELD]
app-agent fingerprint [--detailed]

# Resource management
app-agent apply CONFIG [--namespace NS]
app-agent delete RESOURCE [--all]

# Utility commands
app-agent version
app-agent help [COMMAND]
```

## Integration

### MCP Server

App-Agent includes an MCP (Model Context Protocol) server for integration with AI tools and IDEs:

```typescript
// Start MCP server
npm run mcp:start

// Use in Cursor or other MCP-compatible tools
// Server provides discovery capabilities as structured tools
```

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Test cluster discovery
  run: |
    # Start kind cluster
    kind create cluster --config kind-config.yaml
    
    # Test discovery
    node dist/cli.js discover --kubeconfig ~/.kube/config
    
    # Run full test suite
    npm test
```

## Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes with tests
4. **Ensure** all tests pass: `npm test`
5. **Commit** your changes: `git commit -m 'Add amazing feature'`
6. **Push** to the branch: `git push origin feature/amazing-feature`
7. **Open** a Pull Request

### Development Guidelines

- **Write tests** for new functionality
- **Maintain** TypeScript type safety
- **Follow** existing code patterns and conventions
- **Update documentation** for API changes
- **Test manually** with real clusters when possible

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Roadmap

- [ ] **Enhanced AI Integration**: More sophisticated application construction strategies
- [ ] **Multi-Cluster Support**: Discovery and deployment across multiple clusters
- [ ] **Operator Marketplace**: Integration with operator catalogs and marketplaces
- [ ] **Visual Interface**: Web-based cluster visualization and application designer
- [ ] **GitOps Integration**: Automated deployment pipeline integration
- [ ] **Policy Engine**: Security and compliance policy validation

## Support

- **Documentation**: [Discovery Engine Docs](docs/discovery-engine.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/app-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/app-agent/discussions)

---

**App-Agent** - Intelligent Kubernetes application deployment through comprehensive cluster discovery and AI-powered construction. 