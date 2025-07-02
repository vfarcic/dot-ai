# Manual Testing Guide: Resource Schema Parser and Validator

## Overview

This guide provides comprehensive step-by-step manual testing procedures for the complete Resource Schema Parser and Validator system (Task 3), including all implemented subtasks with expected results and success criteria.

## Prerequisites

- Built project: `npm run build`
- Valid Anthropic API key
- Access to a Kubernetes cluster
- `kubeconfig.yaml` file in project root
- Node.js 18+
- kubectl configured and accessible

## Test Environment Setup

```bash
# Set up environment variables
export ANTHROPIC_API_KEY="your-real-anthropic-api-key-here"

# Verify project is built
npm run build

# Verify kubeconfig exists and is valid
ls -la kubeconfig.yaml
kubectl cluster-info

# Run all tests to ensure baseline functionality
npm test
```

**Expected Test Results:** All 351+ tests should pass before proceeding with manual testing.

## 1. CLI Help System Tests (No Cluster Required)

### Test 1.1: Basic Help Functionality

```bash
# Test main help
node dist/cli.js --help

# Test help variants
node dist/cli.js help
node dist/cli.js -h

# Test command-specific help
node dist/cli.js recommend --help
node dist/cli.js discover --help
```

**Expected Results:**
- All help commands work without cluster connectivity
- Clear usage information displayed
- All commands and options documented
- No cluster connection errors for help

**Success Criteria:**
- [ ] Help displays without requiring cluster access
- [ ] All commands are documented
- [ ] Options are clearly explained
- [ ] Examples provided where appropriate

### Test 1.2: Version Information

```bash
node dist/cli.js --version
```

**Expected Results:**
- Version number displayed
- No cluster connection required

## 2. Schema Parser Tests

### Test 2.1: Standard Kubernetes Resource Parsing

```bash
# Test with standard resources
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a simple pod" --output json
```

**Expected Behavior:**
- Parses standard K8s resources (Pod, Deployment, Service)
- Extracts proper schema fields and constraints
- Handles different API versions correctly

**Validation Checklist:**
- [ ] Standard resources are properly identified
- [ ] Schema fields are correctly parsed
- [ ] Required fields are marked appropriately
- [ ] Namespaced vs cluster-scoped resources handled correctly

### Test 2.2: Custom Resource Definition (CRD) Parsing

```bash
# Test with CRD-focused intent
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "provision infrastructure with Crossplane" --output json
```

**Expected Behavior:**
- Discovers and parses available CRDs
- Handles complex CRD schemas
- Extracts nested parameters and constraints
- Properly formats CRD API versions

**Validation Checklist:**
- [ ] CRDs are discovered and analyzed
- [ ] Complex nested schemas are parsed
- [ ] CRD-specific fields are extracted
- [ ] API version formatting is correct

### Test 2.3: Mixed Resource Scenarios

```bash
# Test intent that could use both standard and custom resources
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a scalable web application with custom operators" --output json
```

**Expected Behavior:**
- Recommends both standard K8s resources and CRDs
- Properly ranks resources by suitability
- Maintains consistent schema structure across resource types

## 3. Resource Recommendation Tests

### Test 3.1: AI-Powered Resource Selection

```bash
# Simple intent
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a web application" --output json

# Complex intent
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a microservices architecture with service mesh and monitoring" --output json
```

**Expected Output Structure:**
```json
{
  "success": true,
  "data": {
    "intent": "user intent text",
    "solutions": [
      {
        "id": "sol-timestamp-random",
        "type": "single|combination",
        "score": 85,
        "description": "AI-generated description",
        "reasons": ["reason1", "reason2"],
        "analysis": "AI analysis",
        "resources": [
          {
            "kind": "ResourceKind",
            "apiVersion": "api/version",
            "group": "api.group",
            "version": "v1",
            "description": "resource description",
            "properties": {...},
            "required": ["field1", "field2"],
            "namespace": true
          }
        ],
        "questions": {
          "required": [...],
          "basic": [...],
          "advanced": [...],
          "open": {...}
        }
      }
    ]
  }
}
```

**Validation Checklist:**
- [ ] Solutions ranked by score (highest first)
- [ ] Each solution has unique ID
- [ ] Resources include complete schema information
- [ ] Questions are categorized appropriately
- [ ] ResourceMapping included in questions

### Test 3.2: Output Format Validation

```bash
# JSON output
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a database" --output json

# YAML output
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a database" --output yaml

# Table output
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a database" --output table
```

**Success Criteria:**
- [ ] JSON output is valid and properly formatted
- [ ] YAML output is valid and readable
- [ ] Table output displays key information clearly
- [ ] All formats contain essential data

## 4. MCP Server Workflow Tests

### Test 4.1: Basic MCP Workflow

```bash
# Step 1: Start MCP server
npm run mcp:start

# Step 2: Connect MCP client (Claude Code, Cursor, etc.) and test workflow:
# - recommend({ intent: "deploy a web application" })
# - chooseSolution({ solutionId: "sol_..." })  
# - answerQuestion({ solutionId: "sol_...", stage: "required", answers: {...} })
# - answerQuestion({ solutionId: "sol_...", stage: "basic", answers: {...} })
# - answerQuestion({ solutionId: "sol_...", stage: "advanced", answers: {...} })
# - answerQuestion({ solutionId: "sol_...", stage: "open", answers: {...} })
# - generateManifests({ solutionId: "sol_..." })
```

**Expected Behavior:**
- Stage-based progressive question answering
- Stateful session management via solutionId
- AI-generated Kubernetes manifests at the end
- Supports skipping optional stages

**Validation Checklist:**
- [ ] recommend returns ranked solutions
- [ ] chooseSolution returns stage-based questions
- [ ] answerQuestion progresses through stages correctly
- [ ] generateManifests produces valid YAML
- [ ] Session state persists across tool calls

### Test 4.2: Manual CLI Testing (Legacy)

```bash
# CLI-only workflow for testing without MCP
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a web application" --output json

# Note: Interactive deployment now requires MCP tools
# CLI recommend provides initial solutions only
```

**Expected Behavior:**
- CLI recommend still works for getting initial solutions
- Full deployment workflow requires MCP server
- Clear messaging about MCP requirement for full features

### Test 4.3: Open Requirements Processing

```bash
# Via MCP client, test open requirements:
# answerQuestion({ 
#   solutionId: "sol_...", 
#   stage: "open", 
#   answers: { "open": "I need PostgreSQL database with SSL and 1000 RPS capacity" }
# })
# generateManifests({ solutionId: "sol_..." })
```

**Expected Results:**
- Open requirements processed to add additional resources (Ingress, ConfigMap, etc.)
- Generated manifests include all necessary components
- AI interprets requirements intelligently

## 5. Manifest Validation Tests

### Test 5.1: Valid Manifest Validation

```bash
# Create a valid test manifest
cat > test-configmap.yaml << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  key: value
EOF

# Validate using kubectl dry-run approach
kubectl apply --dry-run=server -f test-configmap.yaml
```

**Expected Behavior:**
- Validation uses kubectl dry-run for accuracy
- Provides warnings for best practices
- Handles both client-side and server-side validation

### Test 5.2: Invalid Manifest Detection

```bash
# Create invalid manifest
cat > invalid-manifest.yaml << EOF
apiVersion: v1
kind: InvalidResource
metadata:
  name: test
spec:
  invalid: field
EOF

# Test validation
kubectl apply --dry-run=server -f invalid-manifest.yaml 2>&1 || echo "Expected failure"
```

**Expected Results:**
- Clear error messages for invalid resources
- Specific field-level validation errors
- Helpful troubleshooting guidance

## 6. Dynamic Cluster Discovery Tests

### Test 6.1: Namespace Discovery

```bash
# Check what namespaces are available
kubectl get namespaces

# Run recommendation and verify namespace options
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy an app" --output json | grep -A 10 "target-namespace"
```

**Validation:**
- [ ] Discovered namespaces match cluster namespaces
- [ ] Default namespace always included
- [ ] Custom namespaces properly detected

### Test 6.2: Storage Class Discovery

```bash
# Check storage classes
kubectl get storageclass

# Test storage-related intent
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a database with fast storage" --output json
```

**Validation:**
- [ ] Storage questions use actual storage classes
- [ ] Handles clusters without storage classes
- [ ] Default storage class identified if available

### Test 6.3: Node Labels Discovery

```bash
# Check node labels
kubectl get nodes --show-labels

# Test intent requiring specific node placement
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy on specific node types" --output json
```

**Validation:**
- [ ] Node selector questions use real node labels
- [ ] System labels are filtered out
- [ ] Custom labels are preserved

## 7. Error Handling and Edge Cases

### Test 7.1: Missing API Key

```bash
unset ANTHROPIC_API_KEY
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy app" --output json
```

**Expected Output:**
```json
{
  "success": false,
  "error": "ANTHROPIC_API_KEY environment variable must be set for AI-powered resource recommendations"
}
```

### Test 7.2: Cluster Connectivity Issues

```bash
# Test with invalid kubeconfig
KUBECONFIG=invalid-config.yaml node dist/cli.js recommend --intent "deploy app" --output json
```

**Expected Behavior:**
- Clear error message about cluster connectivity
- Helpful troubleshooting guidance
- Application doesn't crash

### Test 7.3: Invalid MCP Parameters

```bash
# Test via MCP client with invalid parameters:
# chooseSolution({ solutionId: "invalid-id" })
# answerQuestion({ solutionId: "nonexistent", stage: "required", answers: {} })
# generateManifests({ solutionId: "missing" })
```

**Expected Results:**
- Clear error messages for invalid solution IDs
- Validation errors for malformed parameters
- Graceful handling of missing session data
- No server crashes

## 8. Performance and Integration Tests

### Test 8.1: Response Time Validation

```bash
# Measure CLI execution time
time KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a complex microservices architecture" --output json

# Test MCP server response times through client
# - recommend should complete within 30 seconds
# - answerQuestion should complete within 5 seconds
# - generateManifests should complete within 45 seconds
```

**Success Criteria:**
- [ ] CLI recommendation completes within 30 seconds
- [ ] MCP generateManifests completes within 45 seconds
- [ ] Other MCP tools respond within 5 seconds
- [ ] No memory leaks or excessive resource usage

### Test 8.2: Large Cluster Handling

```bash
# Test with cluster having many CRDs
kubectl get crd | wc -l

# Run recommendation
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy using custom operators" --output json
```

**Expected Behavior:**
- Handles clusters with 100+ CRDs
- Performance remains acceptable
- Memory usage stays reasonable

## 9. Stateless Design Validation

### Test 9.1: MCP Client Integration Simulation

```bash
# Step 1: Start MCP server
npm run mcp:start

# Step 2: Simulate external MCP client workflow
# External AI agents (Claude Code, Cursor, etc.) would call:
# - recommend({ intent: "deploy web app" })
# - chooseSolution({ solutionId: "sol_..." })
# - answerQuestion through all stages
# - generateManifests({ solutionId: "sol_..." })

# Step 3: Verify session state management
# Check that solutionId maintains state across calls
# Verify generated YAML includes all configuration
```

**Validation:**
- [ ] MCP tools maintain session state via solutionId
- [ ] No server-side persistence required beyond session
- [ ] Complete workflow from intent to manifests
- [ ] Generated YAML reflects all user answers

## Success Criteria Summary

The Resource Schema Parser and Validator system is considered fully functional when:

### Core Functionality
1. **Schema Parsing Works** for both standard K8s resources and CRDs
2. **AI Recommendations** provide relevant, ranked solutions  
3. **Question Generation** creates contextual, categorized questions
4. **Stage-Based Workflow** supports progressive configuration via MCP tools
5. **Manifest Validation** uses kubectl dry-run accurately

### Quality Requirements
6. **All Output Formats** (JSON, YAML, table) work correctly
7. **Error Handling** is robust and user-friendly
8. **Performance** meets acceptable response times
9. **CLI Usability** provides clear help and validation
10. **MCP Integration** supports external agent workflows via session management

### Integration
11. **Dynamic Discovery** populates real cluster options
12. **Mixed Resource Handling** works with standard + custom resources
13. **Test Coverage** maintains 351+ passing automated tests
14. **Documentation** is complete and accurate

## Notes and Limitations

- **AI Variability**: Question generation may vary between runs due to AI model nature
- **Cluster Dependencies**: Some tests require specific cluster configurations
- **API Costs**: Testing consumes Anthropic API credits
- **Network Requirements**: Requires internet access for AI services
- **Permissions**: Requires appropriate kubectl permissions for discovery

## Troubleshooting Guide

### Common Issues

1. **API Authentication**
   ```bash
   # Verify API key format
   echo $ANTHROPIC_API_KEY | wc -c  # Should be ~100 characters
   ```

2. **Cluster Connectivity**
   ```bash
   # Test kubectl access
   kubectl version
   kubectl get nodes
   ```

3. **Permission Issues**
   ```bash
   # Check RBAC permissions
   kubectl auth can-i get pods
   kubectl auth can-i list customresourcedefinitions
   ```

4. **Build Issues**
   ```bash
   # Clean and rebuild
   npm run clean
   npm run build
   npm test
   ```

### Debug Commands

```bash
# Enable debug logging (if implemented)
DEBUG=app-agent:* node dist/cli.js recommend --intent "test"

# Check TypeScript compilation
npx tsc --noEmit

# Verify test environment
node -e "console.log(process.version)"
kubectl version --client
```

---

This manual testing guide ensures comprehensive validation of all Resource Schema Parser and Validator functionality through systematic, repeatable testing procedures.