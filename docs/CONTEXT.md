# Quick Context for New Sessions

## Project: App-Agent - Kubernetes Application Management

**Core Concept**: Dual-mode AI agent (CLI + MCP) that deploys applications to ANY Kubernetes cluster through dynamic discovery.

## Key Architectural Decisions Made

1. **Discovery-Driven**: No hardcoded platforms - discovers CRDs + core K8s resources via `kubectl explain`
2. **Resource-Agnostic**: Works with ANY Kubernetes resources (AppClaim, CloudRun, Knative, standard K8s, custom CRDs, etc.)
3. **Dual-Mode**: Same intelligence, two interfaces:
   - **Direct Mode**: `app-agent` CLI for direct user interaction
   - **MCP Mode**: `app-agent-mcp` server for AI agent integration
4. **Claude Code SDK**: Powers both modes with intelligent conversation and JSON output
5. **Memory-Enhanced**: Learns from deployments, stores lessons in JSON files

## Workflow (Both Modes)
1. **Cluster Discovery** - `kubectl get crd`, `kubectl explain`, `kubectl api-resources`
2. **Strategy Selection** - Choose best available resource type based on discovery
3. **Configuration Gathering** - Dynamic questions based on resource schemas + user intent
4. **Manifest Generation** - Generate using schemas + apply memory lessons
5. **Deployment & Monitoring** - Deploy and track until success/failure

## MCP Functions to Specify
- `create_application` - Entry point, returns discovery + initial guidance
- `continue_workflow` - Progress based on user input
- `deploy_application` - Execute deployment
- `get_deployment_status` - Monitor progress
- Plus any additional functions needed

## Critical Principles
- **Questions are schema-driven**: `kubectl explain <resource>` → generate contextual questions
- **User intent matters**: "web app with scaling" vs "batch job" → different question focus
- **Universal extensibility**: Must work with ANY CRDs without code changes
- **Memory integration**: Learn from patterns, failures, successes

## Files Available
- `design.md` - Complete architecture and examples
- `ORIGINAL_INSPIRATION.md` - The original prompt that started this project (for reference only)
- `NEXT_STEPS.md` - Detailed action plan for immediate next development tasks
- This `CONTEXT.md` - Quick reference for new sessions

## Next Task: API Specifications
Define detailed JSON schemas and examples for all MCP functions, focusing on:
1. Input/output schemas for each function
2. Error handling patterns
3. Workflow state management
4. Discovery result structures
5. Memory lesson formats 