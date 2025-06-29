# Manual Testing Guide: Question Generation Feature

## Overview

This guide provides step-by-step manual testing procedures for the grouped question structure and dynamic cluster discovery functionality implemented in subtask 3.9.

## Prerequisites

- Built project: `npm run build`
- Valid Anthropic API key
- Access to a Kubernetes cluster
- `kubeconfig.yaml` file in project root

## Test Environment Setup

```bash
# Set up environment variables
export ANTHROPIC_API_KEY="your-real-anthropic-api-key-here"

# Verify project is built
npm run build

# Verify kubeconfig exists
ls -la kubeconfig.yaml
```

## Core Functionality Tests

### Test 1: Basic Question Generation

```bash
node dist/cli.js recommend --intent "deploy a simple web application" --output json --kubeconfig kubeconfig.yaml
```

**Expected Output Structure:**
```json
{
  "success": true,
  "data": {
    "intent": "deploy a simple web application",
    "solutions": [
      {
        "id": "sol-1234567890-abc123",
        "type": "single|combination",
        "score": 85,
        "description": "Resource solution description",
        "resources": [
          {
            "kind": "Deployment",
            "apiVersion": "apps/v1",
            "group": "apps",
            "description": "Deployment resource description"
          }
        ],
        "questions": {
          "required": [
            {
              "id": "app-name",
              "question": "What should we name your application?",
              "type": "text",
              "validation": {"required": true, "pattern": "^[a-z0-9-]+$"},
              "placeholder": "my-app"
            }
          ],
          "basic": [
            {
              "id": "target-namespace", 
              "question": "Which namespace should we deploy to?",
              "type": "select",
              "options": ["default", "production", "staging"]
            }
          ],
          "advanced": [
            {
              "id": "resource-limits",
              "question": "Do you need resource limits?",
              "type": "boolean"
            }
          ],
          "open": {
            "question": "Is there anything else about your requirements or constraints that would help us provide better recommendations?",
            "placeholder": "e.g., specific security requirements, performance needs, existing infrastructure constraints..."
          }
        }
      }
    ]
  }
}
```

**Validation Checklist:**
- [ ] Response includes unique solution ID
- [ ] Questions are categorized into required/basic/advanced/open
- [ ] Select questions contain real cluster options (namespaces, storage classes)
- [ ] Questions are contextual to the intent and recommended resources
- [ ] All questions have proper validation rules

### Test 2: Complex Multi-Resource Intent

```bash
node dist/cli.js recommend --intent "deploy a database with persistent storage and load balancing" --output json --kubeconfig kubeconfig.yaml
```

**Expected Behavior:**
- Multiple resources recommended (Deployment, PersistentVolumeClaim, Service)
- More comprehensive questions covering all resource types
- Storage-specific questions should use discovered storage classes
- Service questions should reflect available ingress classes

### Test 3: Different Output Formats

```bash
# Test YAML output
node dist/cli.js recommend --intent "deploy a microservices architecture" --output yaml --kubeconfig kubeconfig.yaml

# Test table output  
node dist/cli.js recommend --intent "deploy a web application" --output table --kubeconfig kubeconfig.yaml
```

**Expected Behavior:**
- YAML format should be properly structured and readable
- Table format should display key information in tabular form
- All formats should contain the questions structure

## Dynamic Cluster Discovery Tests

### Test 4: Namespace Discovery

```bash
# First, check available namespaces in your cluster
kubectl get namespaces

# Then run recommendation
node dist/cli.js recommend --intent "deploy an application" --output json --kubeconfig kubeconfig.yaml
```

**Validation:**
- [ ] Namespace questions should contain actual cluster namespaces
- [ ] Should include 'default' and any custom namespaces

### Test 5: Storage Class Discovery

```bash
# Check available storage classes
kubectl get storageclass

# Run recommendation for storage-heavy workload
node dist/cli.js recommend --intent "deploy a database that needs fast storage" --output json --kubeconfig kubeconfig.yaml
```

**Validation:**
- [ ] Storage-related questions should list actual storage classes
- [ ] If no storage classes, should gracefully handle empty options

### Test 6: Ingress Class Discovery

```bash
# Check ingress classes
kubectl get ingressclass

# Test ingress-related intent
node dist/cli.js recommend --intent "expose my application to the internet" --output json --kubeconfig kubeconfig.yaml
```

**Validation:**
- [ ] Ingress questions should use discovered ingress classes
- [ ] Should handle clusters without ingress controllers

## Error Handling Tests

### Test 7: Missing API Key

```bash
unset ANTHROPIC_API_KEY
node dist/cli.js recommend --intent "deploy app" --output json --kubeconfig kubeconfig.yaml
```

**Expected Output:**
```json
{
  "success": false,
  "error": "ANTHROPIC_API_KEY environment variable must be set for AI-powered resource recommendations"
}
```

### Test 8: Invalid Kubeconfig

```bash
export ANTHROPIC_API_KEY="your-key"
node dist/cli.js recommend --intent "deploy app" --output json --kubeconfig invalid-config.yaml
```

**Expected Behavior:**
- Should provide clear error message about cluster connectivity
- Should not crash the application

### Test 9: Invalid Intent

```bash
node dist/cli.js recommend --intent "" --output json --kubeconfig kubeconfig.yaml
```

**Expected Behavior:**
- Should handle empty intent gracefully
- Should provide meaningful error or fallback questions

## CLI Validation Tests

### Test 10: Missing Required Arguments

```bash
# Missing intent
node dist/cli.js recommend --output json

# Invalid output format
node dist/cli.js recommend --intent "deploy app" --output invalid
```

**Expected Behavior:**
- Clear error messages for missing required options
- Validation of output format options

### Test 11: Help and Usage

```bash
# Main help
node dist/cli.js --help

# Command-specific help
node dist/cli.js recommend --help
```

**Expected Output:**
- Clear description of the recommend command
- List of available options with descriptions
- Examples of proper usage

## Performance Tests

### Test 12: Response Time

```bash
time node dist/cli.js recommend --intent "deploy a web application" --output json --kubeconfig kubeconfig.yaml
```

**Expected Behavior:**
- Total execution time should be reasonable (< 30 seconds)
- Should provide progress indication for long operations
- AI generation should complete within timeout limits

## Success Criteria

The question generation feature is considered successfully implemented when:

1. **All output formats work correctly** (JSON, YAML, table)
2. **Dynamic cluster discovery populates real options** in select questions
3. **Questions are contextually relevant** to user intent and recommended resources
4. **Error handling is robust** for missing API keys, invalid configs, etc.
5. **CLI validation works properly** for all required and optional arguments
6. **Performance is acceptable** for typical use cases
7. **Question categorization is logical** (required vs basic vs advanced vs open)

## Notes

- The question generation uses AI, so responses may vary between runs
- Cluster discovery depends on kubectl access and cluster permissions
- Some tests require actual API credits from Anthropic
- Always test with different cluster configurations (empty cluster, fully configured cluster)

## Troubleshooting

**Common Issues:**
- API key authentication errors
- Kubernetes cluster connectivity issues  
- Missing kubectl binary or configuration
- Network connectivity to Anthropic API

**Debug Commands:**
```bash
# Verify kubectl access
kubectl version

# Test cluster connectivity
kubectl get nodes

# Check API key format
echo $ANTHROPIC_API_KEY | wc -c
```