# App-Agent CLI Guide

**Complete command-line interface guide for App-Agent - AI-powered Kubernetes deployment recommendations.**

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Core Workflow](#core-workflow)
- [Command Reference](#command-reference)
- [Workflow Examples](#workflow-examples)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

## Quick Start

### Prerequisites
- **Node.js 18+** and **kubectl** configured with cluster access
- **Claude API key** (required for AI recommendations)

### Installation

**Current Method: From Source**
```bash
git clone https://github.com/your-org/app-agent.git
cd app-agent
npm install && npm run build

# Required: Set up Claude API key
export ANTHROPIC_API_KEY=your_api_key_here
```

> **Coming Soon**: npm package distribution with `npm install -g app-agent`

### Basic Usage

```bash
# 1. Get AI recommendations for your deployment
node dist/cli.js recommend --intent "deploy a web application" --session-dir ./tmp

# 2. Choose a solution from the recommendations
node dist/cli.js choose-solution --solution-id sol_xxx --session-dir ./tmp

# 3. Configure step-by-step with guided questions
node dist/cli.js answer-question --solution-id sol_xxx --stage required --answers '{"name":"myapp"}' --session-dir ./tmp

# 4. Generate and deploy manifests
node dist/cli.js generate-manifests --solution-id sol_xxx --session-dir ./tmp
node dist/cli.js deploy-manifests --solution-id sol_xxx --session-dir ./tmp
```

## Installation

### From Source (Current)

```bash
# Clone the repository
git clone https://github.com/your-org/app-agent.git
cd app-agent

# Install dependencies and build
npm install
npm run build

# Verify installation
node dist/cli.js --help
```

### Environment Setup

```bash
# Required: Claude API key for AI recommendations
export ANTHROPIC_API_KEY=your_api_key_here

# Optional: Custom kubeconfig location
export KUBECONFIG=/path/to/your/kubeconfig.yaml

# Verify cluster access
kubectl cluster-info
```

### Shell Integration (Optional)

Add to your `.bashrc` or `.zshrc` for convenience:

```bash
# Create alias for easier usage
alias app-agent='node /path/to/app-agent/dist/cli.js'

# Add to PATH (after npm global install becomes available)
export PATH="$PATH:/path/to/app-agent/dist"
```

## Core Workflow

App-Agent uses a **stage-based workflow** that guides you through deployment configuration:

### 1. Intent → Recommendations
Describe what you want to deploy and get AI-powered recommendations based on your cluster capabilities.

### 2. Solution Selection
Choose the best solution from ranked recommendations with detailed explanations.

### 3. Step-by-Step Configuration
Answer configuration questions through multiple stages:
- **Required**: Essential settings (app name, image, etc.)
- **Basic**: Common options (namespace, replicas, etc.)
- **Advanced**: Fine-tuning (resource limits, security contexts, etc.)
- **Open**: Free-form requirements and customizations

### 4. Manifest Generation
AI generates optimized Kubernetes manifests based on your configuration.

### 5. Deployment
Deploy manifests to your cluster with readiness verification.

## Command Reference

### AI-Powered Workflow Commands

#### `recommend`
Get AI-powered deployment recommendations based on your cluster capabilities.

**Usage:**
```bash
node dist/cli.js recommend --intent "DESCRIPTION" --session-dir ./tmp [OPTIONS]
```

**Required Arguments:**
- `--intent "DESCRIPTION"`: Describe what you want to deploy

**Required Options:**
- `--session-dir PATH`: Directory to store solution files

**Optional:**
- `--output FORMAT`: Output format (json|yaml|table, default: json)
- `--verbose`: Enable verbose output
- `--output-file PATH`: Write output to file

**Examples:**
```bash
# Simple web application
node dist/cli.js recommend --intent "deploy a web application" --session-dir ./tmp

# Application with specific requirements
node dist/cli.js recommend --intent "deploy a Node.js API with PostgreSQL database" --session-dir ./tmp

# Microservice with scaling requirements
node dist/cli.js recommend --intent "deploy a microservice that can auto-scale" --session-dir ./tmp
```

#### `choose-solution`
Select a specific solution and get its configuration questions.

**Usage:**
```bash
node dist/cli.js choose-solution --solution-id ID --session-dir PATH [OPTIONS]
```

**Required Arguments:**
- `--solution-id ID`: Solution ID from recommend command (e.g., sol_2025-01-01T123456_abcdef)
- `--session-dir PATH`: Session directory containing solution files

**Optional:**
- `--output FORMAT`: Output format (json|yaml|table, default: json)

**Example:**
```bash
node dist/cli.js choose-solution --solution-id sol_2025-01-01T123456_abcdef --session-dir ./tmp
```

#### `answer-question`
Provide answers to configuration questions for your chosen solution.

**Usage:**
```bash
node dist/cli.js answer-question --solution-id ID --session-dir PATH --stage STAGE --answers JSON [OPTIONS]
```

**Required Arguments:**
- `--solution-id ID`: Solution ID
- `--session-dir PATH`: Session directory path
- `--stage STAGE`: Question stage (required|basic|advanced|open)
- `--answers JSON`: Configuration answers as JSON object

**Optional:**
- `--done`: Mark as final answer for open stage
- `--output FORMAT`: Output format (json|yaml|table, default: json)

**Examples:**
```bash
# Required stage
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./tmp \
  --stage required \
  --answers '{"name":"myapp","image":"nginx:latest","port":80}'

# Basic stage
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./tmp \
  --stage basic \
  --answers '{"namespace":"production","replicas":3}'

# Advanced stage
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./tmp \
  --stage advanced \
  --answers '{"resourceLimits":true,"securityContext":true}'

# Open stage (final step)
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./tmp \
  --stage open \
  --answers '{"open":"Need high availability and monitoring"}' \
  --done
```

#### `generate-manifests`
Generate final Kubernetes manifests from your configured solution.

**Usage:**
```bash
node dist/cli.js generate-manifests --solution-id ID --session-dir PATH [OPTIONS]
```

**Required Arguments:**
- `--solution-id ID`: Fully configured solution ID
- `--session-dir PATH`: Session directory containing solution files

**Example:**
```bash
node dist/cli.js generate-manifests --solution-id sol_xxx --session-dir ./tmp
```

#### `deploy-manifests`
Deploy the generated manifests to your Kubernetes cluster.

**Usage:**
```bash
node dist/cli.js deploy-manifests --solution-id ID --session-dir PATH [OPTIONS]
```

**Required Arguments:**
- `--solution-id ID`: Solution ID with generated manifests
- `--session-dir PATH`: Session directory path

**Optional:**
- `--timeout SECONDS`: Deployment timeout in seconds (default: 30)
- `--output FORMAT`: Output format (json|yaml|table, default: json)

**Examples:**
```bash
# Deploy with default timeout
node dist/cli.js deploy-manifests --solution-id sol_xxx --session-dir ./tmp

# Deploy with custom timeout
node dist/cli.js deploy-manifests --solution-id sol_xxx --session-dir ./tmp --timeout 60
```

### Utility Commands

#### `status`
Check deployment status and workflow information.

**Usage:**
```bash
node dist/cli.js status [OPTIONS]
```

**Optional:**
- `--deployment ID`: Specific deployment/workflow ID to check
- `--output FORMAT`: Output format (json|yaml|table, default: json)

**Example:**
```bash
node dist/cli.js status --deployment workflow-123
```

#### `learn`
Show learned deployment patterns and recommendations from previous deployments.

**Usage:**
```bash
node dist/cli.js learn [OPTIONS]
```

**Optional:**
- `--pattern TYPE`: Filter by pattern type
- `--output FORMAT`: Output format (json|yaml|table, default: json)

**Examples:**
```bash
# Show all learned patterns
node dist/cli.js learn

# Show specific pattern type
node dist/cli.js learn --pattern deployment
```

### Global Options

These options work with all commands:

- `--kubeconfig PATH`: Path to kubeconfig file (overrides KUBECONFIG env var)
- `--verbose`: Enable verbose output globally
- `--output-file PATH`: Write clean formatted output to file
- `--quiet`: Suppress tool registration and info logs

## Workflow Examples

### Example 1: Simple Web Application

```bash
# 1. Get recommendations
node dist/cli.js recommend \
  --intent "deploy an nginx web server" \
  --session-dir ./sessions

# Output shows available solutions with scores:
# Solution 1: Kubernetes Deployment + Service (Score: 95)
# Solution 2: Pod + Service (Score: 80)
# etc.

# 2. Choose the best solution
node dist/cli.js choose-solution \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions

# Output shows configuration questions grouped by stage

# 3. Answer required questions
node dist/cli.js answer-question \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions \
  --stage required \
  --answers '{"name":"my-nginx","image":"nginx:latest","port":80}'

# 4. Answer basic questions
node dist/cli.js answer-question \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions \
  --stage basic \
  --answers '{"namespace":"default","replicas":2}'

# 5. Skip advanced questions (or answer them)
node dist/cli.js answer-question \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions \
  --stage advanced \
  --answers '{}'

# 6. Final open question
node dist/cli.js answer-question \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions \
  --stage open \
  --answers '{"open":"Standard configuration is fine"}' \
  --done

# 7. Generate manifests
node dist/cli.js generate-manifests \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions

# 8. Deploy to cluster
node dist/cli.js deploy-manifests \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions
```

### Example 2: Full-Stack Application

```bash
# 1. Get recommendations for complex application
node dist/cli.js recommend \
  --intent "deploy a React frontend with Node.js API and PostgreSQL database" \
  --session-dir ./fullstack

# 2. Choose solution (likely multiple resources)
node dist/cli.js choose-solution \
  --solution-id sol_xxx \
  --session-dir ./fullstack

# 3. Configure each component
# Frontend configuration
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./fullstack \
  --stage required \
  --answers '{
    "frontend_name": "my-react-app",
    "frontend_image": "my-app:frontend-v1.0",
    "frontend_port": 3000,
    "api_name": "my-api",
    "api_image": "my-app:api-v1.0",
    "api_port": 4000,
    "database_name": "my-postgres"
  }'

# Database configuration
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./fullstack \
  --stage basic \
  --answers '{
    "namespace": "production",
    "frontend_replicas": 3,
    "api_replicas": 2,
    "database_storage": "20Gi"
  }'

# Advanced settings
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./fullstack \
  --stage advanced \
  --answers '{
    "enable_ingress": true,
    "enable_tls": true,
    "resource_limits": true,
    "horizontal_scaling": true
  }'

# Final requirements
node dist/cli.js answer-question \
  --solution-id sol_xxx \
  --session-dir ./fullstack \
  --stage open \
  --answers '{"open": "Need monitoring and backup for database"}' \
  --done

# Generate and deploy
node dist/cli.js generate-manifests --solution-id sol_xxx --session-dir ./fullstack
node dist/cli.js deploy-manifests --solution-id sol_xxx --session-dir ./fullstack
```

### Example 3: Using Output Formats

```bash
# Get recommendations in table format
node dist/cli.js recommend \
  --intent "deploy Redis cache" \
  --session-dir ./redis \
  --output table

# Save results to file
node dist/cli.js recommend \
  --intent "deploy Redis cache" \
  --session-dir ./redis \
  --output yaml \
  --output-file ./redis-recommendations.yaml

# Check status with verbose output
node dist/cli.js status --verbose --output table
```

## Configuration

### Kubeconfig Management

App-Agent automatically finds your kubeconfig file in this order:

1. **Command line flag**: `--kubeconfig /path/to/config`
2. **Environment variable**: `KUBECONFIG=/path/to/config`
3. **Default location**: `~/.kube/config`

**Examples:**
```bash
# Use specific kubeconfig
node dist/cli.js recommend \
  --intent "deploy app" \
  --session-dir ./tmp \
  --kubeconfig ./clusters/production.yaml

# Set environment variable
export KUBECONFIG=./clusters/staging.yaml
node dist/cli.js recommend --intent "deploy app" --session-dir ./tmp
```

### Session Directory Management

**Project-specific sessions:**
```bash
mkdir -p ./deployments/sessions
node dist/cli.js recommend \
  --intent "deploy app" \
  --session-dir ./deployments/sessions
```

**Shared sessions:**
```bash
mkdir -p ~/.app-agent/sessions
node dist/cli.js recommend \
  --intent "deploy app" \
  --session-dir ~/.app-agent/sessions
```

**Session directory structure:**
```
sessions/
├── sol_2025-01-01T123456_abcdef/
│   ├── solution.json          # Solution configuration
│   ├── questions.json         # Question responses
│   ├── manifest.yaml         # Generated manifests
│   └── metadata.json         # Deployment metadata
└── sol_2025-01-01T789012_fedcba/
    └── ...
```

### API Keys

```bash
# Required for AI recommendations
export ANTHROPIC_API_KEY=your_api_key_here

# Verify API key is accessible
echo $ANTHROPIC_API_KEY
```

## Troubleshooting

### Common Issues

#### Command Not Found

**Symptoms:**
- `app-agent: command not found`
- `node: No such file or directory`

**Solutions:**
```bash
# Verify Node.js installation
node --version
npm --version

# Use full path if needed
/path/to/app-agent/dist/cli.js --help

# Build if not already built
cd /path/to/app-agent
npm run build
```

#### API Key Issues

**Symptoms:**
- "ANTHROPIC_API_KEY environment variable must be set"
- AI recommendation failures

**Solutions:**
```bash
# Check if API key is set
echo $ANTHROPIC_API_KEY

# Set API key
export ANTHROPIC_API_KEY=your_actual_key_here

# Verify key format
# Should start with 'sk-ant-api03-' for Claude API keys
```

#### Kubeconfig Issues

**Symptoms:**
- "Cannot connect to Kubernetes cluster"
- "Kubeconfig file not found"
- "connection refused"

**Solutions:**
```bash
# Test cluster connectivity
kubectl cluster-info
kubectl get nodes

# Check kubeconfig location
echo $KUBECONFIG
ls -la ~/.kube/config

# Use specific kubeconfig
node dist/cli.js recommend \
  --intent "test" \
  --session-dir ./tmp \
  --kubeconfig ./path/to/working/config.yaml
```

#### Session Directory Issues

**Symptoms:**
- "Session directory does not exist"
- "Permission denied"
- "Session directory is not writable"

**Solutions:**
```bash
# Create session directory
mkdir -p ./tmp/sessions
chmod 755 ./tmp/sessions

# Check permissions
ls -la ./tmp/
touch ./tmp/sessions/test-write && rm ./tmp/sessions/test-write

# Use absolute path
node dist/cli.js recommend \
  --intent "test" \
  --session-dir "$(pwd)/sessions"
```

#### Solution ID Issues

**Symptoms:**
- "Solution not found"
- "Invalid solution ID format"

**Solutions:**
```bash
# List available solutions
ls -la ./sessions/

# Use exact solution ID from recommend output
# Format: sol_YYYY-MM-DDTHHMISS_randomhash
node dist/cli.js choose-solution \
  --solution-id sol_2025-01-01T123456_abcdef \
  --session-dir ./sessions
```

### Debug Mode

```bash
# Enable verbose output for detailed logging
node dist/cli.js recommend \
  --intent "debug test" \
  --session-dir ./tmp \
  --verbose

# Check what's in session directory
ls -la ./tmp/sol_*/
cat ./tmp/sol_*/solution.json
```

### Performance Issues

**Large clusters:**
- Discovery may take longer with many CRDs
- Use `--verbose` to monitor progress
- Consider filtering intent to be more specific

**Network timeouts:**
```bash
# Increase timeout for deployment
node dist/cli.js deploy-manifests \
  --solution-id sol_xxx \
  --session-dir ./tmp \
  --timeout 120
```

## Advanced Usage

### Scripting and Automation

**Bash script example:**
```bash
#!/bin/bash
set -e

SESSION_DIR="./automated-deployment"
INTENT="deploy nginx web server"

echo "Starting automated deployment..."

# Get recommendations
RESULT=$(node dist/cli.js recommend \
  --intent "$INTENT" \
  --session-dir "$SESSION_DIR" \
  --output json)

# Extract best solution ID
SOLUTION_ID=$(echo "$RESULT" | jq -r '.data.solutions[0].id')
echo "Using solution: $SOLUTION_ID"

# Choose solution
node dist/cli.js choose-solution \
  --solution-id "$SOLUTION_ID" \
  --session-dir "$SESSION_DIR" \
  --output json

# Answer all questions with defaults/preset values
node dist/cli.js answer-question \
  --solution-id "$SOLUTION_ID" \
  --session-dir "$SESSION_DIR" \
  --stage required \
  --answers '{"name":"auto-nginx","image":"nginx:latest","port":80}'

node dist/cli.js answer-question \
  --solution-id "$SOLUTION_ID" \
  --session-dir "$SESSION_DIR" \
  --stage basic \
  --answers '{}'

node dist/cli.js answer-question \
  --solution-id "$SOLUTION_ID" \
  --session-dir "$SESSION_DIR" \
  --stage advanced \
  --answers '{}'

node dist/cli.js answer-question \
  --solution-id "$SOLUTION_ID" \
  --session-dir "$SESSION_DIR" \
  --stage open \
  --answers '{"open":"Automated deployment"}' \
  --done

# Generate and deploy
node dist/cli.js generate-manifests \
  --solution-id "$SOLUTION_ID" \
  --session-dir "$SESSION_DIR"

node dist/cli.js deploy-manifests \
  --solution-id "$SOLUTION_ID" \
  --session-dir "$SESSION_DIR"

echo "Deployment completed successfully!"
```

### CI/CD Integration

**GitHub Actions example:**
```yaml
name: Deploy with App-Agent

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Setup kubectl
      uses: azure/setup-kubectl@v3
    
    - name: Deploy with App-Agent
      env:
        ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        KUBECONFIG: ${{ github.workspace }}/kubeconfig
      run: |
        # Your deployment script here
        ./scripts/automated-deployment.sh
```

### Multiple Clusters

```bash
# Production cluster
export KUBECONFIG=./clusters/production.yaml
node dist/cli.js recommend \
  --intent "deploy production app" \
  --session-dir ./sessions/prod

# Staging cluster  
export KUBECONFIG=./clusters/staging.yaml
node dist/cli.js recommend \
  --intent "deploy staging app" \
  --session-dir ./sessions/staging
```

### Custom Output Processing

```bash
# Extract specific information with jq
node dist/cli.js recommend \
  --intent "deploy app" \
  --session-dir ./tmp \
  --output json | jq '.data.solutions[0].score'

# Convert to different formats
node dist/cli.js status --output yaml > status.yaml
node dist/cli.js learn --output table | grep -i deployment
```

## See Also

- [MCP Integration Guide](mcp-guide.md) - Use App-Agent with AI development tools
- [API Reference](API.md) - Programmatic usage and TypeScript interfaces
- [Development Guide](DEVELOPMENT.md) - Contributing and architecture
- [Manual Testing](manual-testing.md) - Testing procedures and examples