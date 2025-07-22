# Development Guide

## Architecture

### Core Components

- **Discovery Engine** (`src/core/discovery.ts`): Comprehensive Kubernetes cluster discovery and analysis
- **AI Integration** (`src/core/claude.ts`): Claude AI integration for intelligent application construction  
- **Schema Parser** (`src/core/schema.ts`): Resource schema parsing, validation, and AI-powered recommendations
- **Stage-Based Workflow Tools** (`src/tools/`): MCP tools for progressive configuration (recommend, chooseSolution, answerQuestion, generateManifests)
- **Memory System** (`src/core/memory.ts`): Persistent memory for learning and context retention
- **Workflow Engine** (`src/core/workflow.ts`): Orchestrates the application construction process
- **Test Interface** (`src/interfaces/cli.ts`): Testing interface for development purposes
- **MCP Interface** (`src/interfaces/mcp.ts`): Model Context Protocol server for tool integration

### Data Structures

The discovery engine provides comprehensive, unfiltered data through well-defined TypeScript interfaces:

- **`EnhancedResource`**: Standard Kubernetes resources with metadata
- **`EnhancedCRD`**: Custom Resource Definitions with version and schema info
- **`ResourceExplanation`**: Detailed field-level schema information
- **`ClusterFingerprint`**: Comprehensive cluster capabilities and configuration
- **`ResourceMap`**: Container for all discovered resources

## Development Workflow

### Prerequisites
- [DevBox](https://www.jetify.com/docs/devbox/installing_devbox) installed
- Access to a Kubernetes cluster (local or remote)

### Setup

```bash
# Clone the repository
git clone https://github.com/vfarcic/dot-ai.git
cd dot-ai

# Enter DevBox shell (installs all required tools)
devbox shell

# Install dependencies and build
npm install
npm run build

# Set up test cluster (optional)
./dot.nu setup
```

### Making Changes

1. **Make changes** to source files in `src/`
2. **Build** the project: `npm run build`
3. **Run tests** to ensure functionality: `npm test`
4. **Test manually** with real cluster: `node dist/cli.js discover --kubeconfig kubeconfig.yaml`
5. **Commit changes** with descriptive messages

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test suite
npm test -- tests/core.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="generateManifests"
```

### Test Coverage

The project maintains comprehensive test coverage:
- **Unit Tests**: Core functionality and error conditions
- **Integration Tests**: Real cluster connectivity using kind cluster
- **TDD Tests**: Error handling and graceful degradation scenarios
- **Manual Validation**: MCP tool verification and data structure validation

Current coverage: **57.32% overall**

### Code Quality

- **TypeScript**: Maintain strict type safety
- **ESLint**: Follow existing linting rules
- **Testing**: Write tests for new functionality
- **Documentation**: Update docs for API changes
- **Error Handling**: Follow patterns in [Error Handling Guide](error-handling.md)

## Contributing

### Development Guidelines

- **Write tests** for new functionality
- **Maintain** TypeScript type safety
- **Follow** existing code patterns and conventions
- **Update documentation** for API changes
- **Test manually** with real clusters when possible

### Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes with tests
4. **Ensure** all tests pass: `npm test`
5. **Commit** your changes: `git commit -m 'Add amazing feature'`
6. **Push** to the branch: `git push origin feature/amazing-feature`
7. **Open** a Pull Request

## CI/CD Integration

### GitHub Actions

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

### Local Testing with Kind

```bash
# Create test cluster using DevBox setup
./dot.nu setup

# Run integration tests
export KUBECONFIG=kubeconfig.yaml
npm test -- tests/integration

# Cleanup
./dot.nu destroy
```

## Debugging

### Common Issues

**Connection Errors**
- Verify kubeconfig path and permissions
- Check cluster connectivity: `kubectl cluster-info`
- Ensure proper RBAC permissions for discovery operations

**API Discovery Failures**
- Some resources may require specific cluster configurations
- CRD discovery depends on installed operators
- Permission issues may limit resource visibility

**AI Integration Issues**
- Verify `ANTHROPIC_API_KEY` environment variable
- Check API rate limits and quotas
- Review error logs for specific AI service issues

### Debug Logging

```bash
# Enable verbose logging
DEBUG=node dist/cli.js:* node dist/cli.js discover

# Specific module debugging
DEBUG=node dist/cli.js:discovery node dist/cli.js discover
DEBUG=node dist/cli.js:schema node dist/cli.js recommend --intent "test"

# MCP server debugging
DEBUG=node dist/cli.js:* npm run mcp:start
```

## Performance Considerations

- **Resource Discovery**: Can be slow in large clusters with many CRDs
- **AI Operations**: Network latency affects recommendation speed
- **Session Management**: generateManifests can take 30-45 seconds for complex deployments
- **Memory Usage**: Large cluster discoveries may consume significant memory
- **MCP Server**: Designed for persistent connection with multiple tool calls
- **Caching**: Consider implementing caching for repeated operations

## Roadmap

- [x] **Stage-Based Workflow**: Completed conversational deployment via MCP tools
- [x] **AI-Generated Manifests**: Schema-aware YAML generation with validation
- [ ] **Enhanced AI Integration**: More sophisticated application construction strategies
- [ ] **Multi-Cluster Support**: Discovery and deployment across multiple clusters
- [ ] **Operator Marketplace**: Integration with operator catalogs and marketplaces
- [ ] **Visual Interface**: Web-based cluster visualization and application designer
- [ ] **GitOps Integration**: Automated deployment pipeline integration
- [ ] **Policy Engine**: Security and compliance policy validation

