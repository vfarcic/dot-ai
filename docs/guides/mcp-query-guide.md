# Cluster Query Guide

**Complete guide for using natural language to query your Kubernetes cluster through MCP (Model Context Protocol).**

![Cluster Query Infographic](../img/query.jpeg)

## Using via Web UI

These tools are also available through the [Web Dashboard](https://devopstoolkit.ai/docs/ui).

## Prerequisites

Before using this guide, complete the [MCP Setup](../setup/mcp-setup.md).

**Optional but strongly recommended:**
- Scanned capabilities - see [Capability Management](mcp-capability-management-guide.md)
- Resources synced to Vector DB - automatically handled by the [dot-ai-controller](https://devopstoolkit.ai/docs/controller)

> **Note**: While the query tool technically works without capabilities and resources in the Vector DB (falling back to raw kubectl commands), AI performance and accuracy will be severely reduced. Capabilities provide semantic understanding (knowing that "database" relates to StatefulSet, CNPG, etc.), and resources provide fast inventory lookups. Without these, the AI loses its ability to answer concept-based queries and must rely solely on kubectl, resulting in slower and less intelligent responses.

## Related Projects

**[dot-ai-controller](https://devopstoolkit.ai/docs/controller)** - A Kubernetes controller that automatically scans cluster capabilities and syncs resources to the Vector DB. This enables the query tool's semantic understanding and fast inventory lookups without manual setup.

## Overview

The DevOps AI Toolkit query feature provides:
- **Natural language cluster queries** - Ask questions about your cluster in plain English
- **Semantic understanding** - Query by concept ("databases", "web servers") not just resource names
- **Multi-source intelligence** - Combines Vector DB knowledge with live kubectl data
- **AI-powered orchestration** - LLM decides which tools to use based on your intent
- **Read-only operations** - Safe cluster exploration without risk of modifications

### How AI-Driven Querying Works

**Traditional Problem**: Finding cluster resources requires knowing kubectl syntax, label conventions, and resource types.

**AI Query Solution**: Describe what you want to find in natural language, and AI orchestrates the right tools.

**Query Flow**:
1. **Intent Analysis**: AI interprets your natural language query
2. **Tool Selection**: AI chooses appropriate tools (Vector DB search, kubectl commands)
3. **Data Gathering**: Tools execute and return results
4. **Response Synthesis**: AI summarizes findings in human-readable format

### Three Data Sources

The query tool combines three data sources to answer your questions intelligently:

| Source | What it provides | Example use |
|--------|------------------|-------------|
| **Capabilities** | Semantic understanding - knows that "database" relates to StatefulSet, CNPG Cluster, Crossplane RDS, etc. | "What databases are running?" |
| **Resources** | Searchable inventory - find resources by name patterns, labels, or annotations without knowing kubectl syntax or exact resource locations | "Find all resources with label team=platform" |
| **Kubernetes API** | Live cluster state - real-time status, events, logs, and detailed resource information via kubectl | "Describe the my-postgres cluster" |

This combination enables natural language queries while providing accurate, live cluster data.

## Complete Workflow Examples

> **Tip**: If your MCP client doesn't automatically use the query tool, add "use dot-ai MCP" to your query (e.g., "What databases are running? Use dot-ai MCP").

This section demonstrates common query patterns:

- **[Semantic Queries](#semantic-queries)** - Find resources by concept
- **[Direct Queries](#direct-queries)** - Ask about specific resources or namespaces
- **[Status Queries](#status-queries)** - Check health and troubleshoot issues

---

### Semantic Queries

Semantic queries let you find resources by concept rather than exact resource types. The AI uses the semantic bridge pattern to map concepts like "dot-ai components" to actual Kubernetes resource kinds.

#### Example: Find components by concept

```text
What dot-ai components are running in the cluster?
```

**Response:**

```text
The cluster has the following dot-ai components running in the dot-ai namespace:

Deployments (4)

| Component                 | Version  | Port | Description                                              |
|---------------------------|----------|------|----------------------------------------------------------|
| dot-ai                    | v0.178.0 | 3456 | MCP Server - AI-powered model context protocol server using Anthropic Haiku, connects to<br>Qdrant for embeddings |
| dot-ai-ui                 | v0.4.0   | 3000 | Web UI for interacting with the MCP server               |
| dot-ai-website            | v0.3.22  | 8080 | Marketing/documentation website                          |
| dot-ai-controller-manager | v0.38.0  | -    | Kubernetes operator for managing dot-ai custom resources |

StatefulSets (1)

| Component     | Version | Description                                   |
|---------------|---------|-----------------------------------------------|
| dot-ai-qdrant | v1.15.5 | Qdrant vector database for storing embeddings |

Services (5)

- dot-ai - ClusterIP on port 3456
- dot-ai-ui - ClusterIP on port 3000
- dot-ai-website - ClusterIP on port 80
- dot-ai-qdrant - ClusterIP (ports 6333, 6334, 6335)
- dot-ai-qdrant-headless - Headless service for cluster discovery

All components are Ready/Available with 1 replica each, managed by Helm and deployed via ArgoCD.

📊 View visualization: https://ui.devopstoolkit.ai/v/qry-1767307302957-c4c0e695
```

**What happened**: The AI searched capabilities to understand "dot-ai components", queried the resources inventory to find matching Deployments, StatefulSets, and Services, then retrieved live status from the Kubernetes API.

#### Visualization (Optional)

The visualization URL opens an interactive topology view in the Web UI:

![Query Visualization Example](../img/query-example-01.png)

> **Note**: Visualization URLs require additional setup:
> - Configure `webUI.baseUrl` in your Helm values (see [Kubernetes Setup - Web UI Visualization](../setup/kubernetes-setup.md#web-ui-visualization))
> - Install the Web UI (see [Web UI Documentation](https://devopstoolkit.ai/docs/ui))

---

### Direct Queries

Direct queries ask about specific resources. The AI finds the resource and retrieves detailed information without needing you to specify the exact namespace or resource type.

#### Example: Describe a specific resource

```text
Describe the my-postgres cluster
```

**Response:**

```text
my-postgres Cluster

Type: CloudNativePG (CNPG) PostgreSQL Cluster
Namespace: default
Status: Healthy (1/1 instances ready)

Cluster Overview

| Property           | Value           |
|--------------------|-----------------|
| PostgreSQL Version | 17.4            |
| Age                | 22 minutes      |
| Instances          | 1 (single node) |
| Primary Pod        | my-postgres-1   |
| Database           | app             |

Configuration

| Setting               | Value                 |
|-----------------------|-----------------------|
| Storage               | 1Gi persistent volume |
| Encoding              | UTF8 (C locale)       |
| WAL Level             | logical               |
| TLS                   | TLSv1.3 (min/max)     |
| Max Parallel Workers  | 32                    |
| Max Replication Slots | 32                    |
| Superuser Access      | Disabled (secure)     |

Services

| Service        | Purpose              |
|----------------|----------------------|
| my-postgres-rw | Read-write (primary) |
| my-postgres-r  | Read                 |
| my-postgres-ro | Read-only            |

The cluster is production-ready with enterprise features including automated
failover support, backup/recovery capabilities, and secure TLS communication.
```

**What happened**: The AI searched the resources inventory to locate `my-postgres`, identified it as a CNPG Cluster in the default namespace, then used the Kubernetes API to get detailed status and configuration.

---

### Status Queries

Status queries check the health and operational state of resources. The AI gathers information from multiple sources including events to provide a comprehensive health assessment.

#### Example: Check resource health

```text
Is PostgreSQL healthy?
```

**Response:**

```text
✅ PostgreSQL is Healthy

The CloudNativePG cluster my-postgres is fully operational:

| Component            | Status                        |
|----------------------|-------------------------------|
| Cluster State        | ✅ Healthy                    |
| Instances            | ✅ 1/1 ready                  |
| Primary Pod          | ✅ my-postgres-1 running      |
| Containers           | ✅ 1/1 ready                  |
| Continuous Archiving | ✅ Working                    |
| Certificates         | ✅ Valid until March 26, 2026 |
| Storage (PVC)        | ✅ Healthy                    |
| Services             | ✅ RW and RO available        |

Uptime: 26 minutes, no restarts
Health Checks: All passing (liveness, readiness, startup)
Events: No warnings or errors detected
```

**What happened**: The AI used capabilities to identify PostgreSQL-related resources, searched the inventory, then queried the Kubernetes API for status, pod details, and events to compile a comprehensive health report.
