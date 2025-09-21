# DevOps AI Toolkit REST API Gateway

**Complete guide for accessing DevOps AI Toolkit functionality via standard HTTP REST endpoints.**

## Overview

The REST API Gateway provides HTTP access to all DevOps AI Toolkit capabilities without requiring MCP protocol implementation. Perfect for:

- **DevOps Engineers**: Integrate tools into automation scripts and CI/CD pipelines
- **Platform Teams**: Add AI-powered Kubernetes assistance to existing HTTP-based infrastructure  
- **QA/Testing Teams**: Create comprehensive integration tests with simple HTTP calls
- **Kubernetes Controller Developers**: Access AI tools via familiar REST patterns

### What it provides:
- **Universal Tool Access**: All 9 MCP tools available via `POST /api/v1/tools/{toolName}` endpoints
- **Auto-Generated Documentation**: OpenAPI 3.0 specification with interactive documentation
- **Zero Maintenance**: Automatically stays current when new tools are added
- **Standard HTTP**: JSON request/response with proper status codes
- **Tool Discovery**: Searchable catalog of available tools and capabilities

## Setup

The REST API is automatically available when you deploy the DevOps AI Toolkit MCP server. **No special configuration is needed** - the same server provides both MCP protocol and REST API endpoints simultaneously.

**🎯 Follow the [Kubernetes Setup Guide](setup/kubernetes-setup.md) to deploy the server.**

The Kubernetes deployment automatically provides:
- ✅ **REST API endpoints** on the configured ingress URL  
- ✅ **MCP protocol access** for AI development tools
- ✅ **All dependencies** including Qdrant vector database
- ✅ **Both protocols simultaneously** with no conflicts

## Quick Start

### 1. Discover Available Tools

```bash
curl -s http://localhost:3456/api/v1/tools | jq '.data.tools[] | {name, description, category}'
```

**Response**: List of 9 available tools with descriptions:
```json
[
  {
    "name": "version",
    "description": "Get comprehensive system status including version information, Vector DB connection status, embedding service capabilities, Anthropic API connectivity, Kubernetes cluster connectivity, Kyverno policy engine status, and pattern management health check",
    "category": "System"
  },
  {
    "name": "recommend", 
    "description": "Deploy, create, setup, install, or run applications, infrastructure, and services on Kubernetes with AI recommendations",
    "category": "AI Tools"
  },
  {
    "name": "remediate",
    "description": "AI-powered Kubernetes issue analysis that provides root cause identification and actionable remediation steps",
    "category": "Troubleshooting"
  }
]
```

### 2. Get System Status

```bash
curl -s -X POST http://localhost:3456/api/v1/tools/version \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response**: Comprehensive system status (truncated):
```json
{
  "success": true,
  "data": {
    "result": {
      "status": "success",
      "system": {
        "version": {
          "version": "0.90.0",
          "nodeVersion": "v23.11.0",
          "platform": "darwin"
        },
        "vectorDB": {
          "connected": true,
          "collections": {
            "patterns": {"exists": true, "documentsCount": 3},
            "policies": {"exists": true, "documentsCount": 3},
            "capabilities": {"exists": true, "documentsCount": 157}
          }
        },
        "kubernetes": {
          "connected": true,
          "context": "kind-kind"
        }
      }
    }
  }
}
```

### 3. Access Interactive API Documentation

```bash
# Get OpenAPI specification
curl -s http://localhost:3456/api/v1/openapi | jq '.info'
```

**Response**: OpenAPI 3.0 specification with all tool schemas:
```json
{
  "title": "DevOps AI Toolkit REST API",
  "description": "REST API gateway for DevOps AI Toolkit MCP tools",
  "version": "1.0.0",
  "contact": {
    "name": "Viktor Farcic",
    "url": "https://devopstoolkit.live/"
  }
}
```

## API Reference

### Base URL and Versioning

**Base URL**: `http://localhost:3456/api/v1`

All endpoints use `/api/v1/` prefix for versioning. Future API changes will use new version paths (`/api/v2/`) maintaining backward compatibility.

### Core Endpoints

#### Tool Discovery
```http
GET /api/v1/tools
```

**Query Parameters**:
- `category` - Filter by tool category (e.g., "AI Tools", "System", "Troubleshooting")
- `tag` - Filter by a single tag (e.g., "kubernetes", "deployment", "analysis") 
- `search` - Search tool names and descriptions

**Examples**:
```bash
# Get all AI-powered tools
curl "http://localhost:3456/api/v1/tools?category=AI%20Tools"

# Find deployment-related tools
curl "http://localhost:3456/api/v1/tools?tag=deployment"

# Search for troubleshooting tools
curl "http://localhost:3456/api/v1/tools?search=troubleshoot"
```

#### Tool Execution
```http
POST /api/v1/tools/{toolName}
Content-Type: application/json
```

**Request Body**: Tool-specific parameters (see OpenAPI spec for schemas)
**Response**: Standardized JSON response with tool results

#### OpenAPI Documentation
```http
GET /api/v1/openapi
```

Returns complete OpenAPI 3.0 specification with:
- All tool endpoints and schemas
- Parameter descriptions and validation rules
- Response formats and error codes
- Interactive documentation support

### Response Format

All REST API responses follow this standard format:

```json
{
  "success": boolean,
  "data": {
    "result": any,           // Tool execution result
    "tool": string,          // Tool name
    "executionTime": number  // Execution time in milliseconds
  },
  "error": {                 // Only present if success: false
    "code": string,
    "message": string,
    "details": any
  },
  "meta": {
    "timestamp": string,     // ISO 8601 timestamp
    "requestId": string,     // Unique request identifier
    "version": string        // API version
  }
}
```

### HTTP Status Codes

- **200 OK**: Successful tool execution
- **400 Bad Request**: Invalid request parameters or missing required fields
- **404 Not Found**: Tool does not exist
- **405 Method Not Allowed**: Invalid HTTP method (tools only accept POST)
- **500 Internal Server Error**: Tool execution failure or server error

## Tool Discovery and Filtering

Instead of listing all tools statically, use the API to discover available tools dynamically:

### Discover All Tools
```bash
curl http://your-ingress-url/api/v1/tools | jq '.data.tools[] | {name, description, category}'
```

### Filter by Category
```bash
# Get all AI-powered tools
curl "http://your-ingress-url/api/v1/tools?category=AI%20Tools"

# Available categories: AI Tools, Deployment, Management, System, Troubleshooting, Documentation
```

### Filter by Tags
```bash
# Find deployment-related tools
curl "http://your-ingress-url/api/v1/tools?tags=deployment"

# Find troubleshooting tools
curl "http://your-ingress-url/api/v1/tools?tags=troubleshooting"
```

### Search Tools
```bash
# Search for specific functionality
curl "http://your-ingress-url/api/v1/tools?search=kubernetes"
curl "http://your-ingress-url/api/v1/tools?search=database"
```

### Get Complete Tool Documentation
For detailed parameter schemas and usage instructions:
```bash
# Get OpenAPI specification with all tool schemas
curl http://your-ingress-url/api/v1/openapi | jq '.paths'
```


## Workflows and Use Cases

The REST API provides the same workflows as the MCP protocol. The only difference is using HTTP POST requests instead of MCP protocol calls.

**For complete workflow patterns and use cases, see the tool-specific guides:**
- **Deployment Workflows**: [Kubernetes Deployment Recommendations](mcp-recommendation-guide.md)
- **Troubleshooting Workflows**: [AI-Powered Issue Remediation](mcp-remediate-guide.md) 
- **Capability Management**: [Capability Management Guide](mcp-capability-management-guide.md)
- **Pattern Management**: [Pattern Management Guide](pattern-management-guide.md)

**Example: Converting MCP workflow to REST**
```bash
# Instead of MCP tool call:
# mcp__dot-ai__recommend with {"intent": "deploy PostgreSQL database"}

# Use REST API:
curl -X POST http://your-ingress-url/api/v1/tools/recommend \
  -H "Content-Type: application/json" \
  -d '{"intent": "deploy PostgreSQL database"}'
```

The business logic, parameters, responses, and multi-step workflows are identical between both protocols.
