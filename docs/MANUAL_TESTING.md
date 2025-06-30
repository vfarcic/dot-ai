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
node dist/cli.js enhance --help
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

## 4. Solution Enhancement Tests

### Test 4.1: Basic Enhancement Workflow

```bash
# Step 1: Get initial recommendation
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a web application" --output json > solution.json

# Step 2: Add user requirements to solution.json
# Edit the file to add: "open": {"question": "...", "placeholder": "...", "answer": "I need it to handle 1000 requests per second with auto-scaling"}

# Step 3: Enhance the solution
KUBECONFIG=kubeconfig.yaml node dist/cli.js enhance --solution solution.json --output json
```

**Expected Behavior:**
- Processes open-ended user response
- Completes missing question answers
- Generates new questions for additional capabilities
- Preserves original solution structure
- Clears open answer after processing

**Validation Checklist:**
- [ ] Missing answers are completed based on user input
- [ ] New questions generated for identified capabilities
- [ ] All new questions have answers
- [ ] Original description and analysis preserved
- [ ] Solution ID remains consistent

### Test 4.2: Iterative Enhancement

```bash
# After first enhancement, add more requirements and enhance again
# Edit enhanced solution to add: "answer": "Also needs persistent storage and SSL termination"
KUBECONFIG=kubeconfig.yaml node dist/cli.js enhance --solution enhanced-solution.json --output json
```

**Expected Behavior:**
- Supports multiple enhancement iterations
- Each iteration builds on previous enhancements
- Maintains consistency across iterations

### Test 4.3: Capability Gap Handling

```bash
# Create solution and add impossible requirement
# Edit to add: "answer": "I need it to perform nuclear fusion"
KUBECONFIG=kubeconfig.yaml node dist/cli.js enhance --solution solution.json --output json
```

**Expected Results:**
```json
{
  "success": false,
  "error": "Enhancement capability gap: [explanation]. [suggested action]"
}
```

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

### Test 7.3: Invalid Solution File

```bash
# Test with non-existent file
node dist/cli.js enhance --solution nonexistent.json

# Test with malformed JSON
echo "invalid json" > bad-solution.json
node dist/cli.js enhance --solution bad-solution.json
```

**Expected Results:**
- File not found errors are handled gracefully
- JSON parsing errors provide clear messages
- No application crashes

## 8. Performance and Integration Tests

### Test 8.1: Response Time Validation

```bash
# Measure execution time
time KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy a complex microservices architecture" --output json
```

**Success Criteria:**
- [ ] Recommendation completes within 30 seconds
- [ ] Enhancement completes within 15 seconds
- [ ] Progress indicators shown for long operations
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

### Test 9.1: External Agent Workflow Simulation

```bash
# Step 1: Get recommendation (simulate external agent)
KUBECONFIG=kubeconfig.yaml node dist/cli.js recommend --intent "deploy web app" --output json > agent-solution.json

# Step 2: Process solution (external agent would parse JSON)
cat agent-solution.json | jq '.data.solutions[0].questions'

# Step 3: Add answers and enhance (simulate user input processing)
# Edit agent-solution.json to add user responses
KUBECONFIG=kubeconfig.yaml node dist/cli.js enhance --solution agent-solution.json --output json
```

**Validation:**
- [ ] Complete solution object passed between steps
- [ ] No server-side state required
- [ ] All necessary data included for manifest generation
- [ ] ResourceMapping preserved for field population

## Success Criteria Summary

The Resource Schema Parser and Validator system is considered fully functional when:

### Core Functionality
1. **Schema Parsing Works** for both standard K8s resources and CRDs
2. **AI Recommendations** provide relevant, ranked solutions
3. **Question Generation** creates contextual, categorized questions
4. **Solution Enhancement** processes user requirements iteratively
5. **Manifest Validation** uses kubectl dry-run accurately

### Quality Requirements
6. **All Output Formats** (JSON, YAML, table) work correctly
7. **Error Handling** is robust and user-friendly
8. **Performance** meets acceptable response times
9. **CLI Usability** provides clear help and validation
10. **Stateless Design** supports external agent workflows

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