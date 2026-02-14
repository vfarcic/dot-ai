# Knowledge Base Guide

**Complete guide for ingesting and searching organizational documentation with the DevOps AI Toolkit.**

## Overview

Knowledge Base provides semantic search over organizational documentation. Documents are ingested, chunked, and stored in a vector database. Users can then search this knowledge base using natural language queries through the `manageKnowledge` tool.

### What is Knowledge Base?

Knowledge Base allows you to:
- **Ingest documents** into a searchable vector store
- **Search semantically** using natural language to find relevant content by meaning, not just keywords
- **Maintain provenance** with full source URLs so users can verify and explore original documents

### How It Works

1. **Ingestion**: Documents are split into chunks (~1000 characters), embedded, and stored in Qdrant
2. **Search**: Queries are embedded and matched against stored chunks by semantic similarity
3. **Results**: Matching chunks are returned with source URI, relevance score, and metadata

### Key Concepts

| Concept | Description |
|---------|-------------|
| **URI** | Full URL identifying the source document (e.g., `https://github.com/org/repo/blob/main/docs/guide.md`) |
| **Chunk** | A segment of a document stored with its embedding for semantic search |
| **Semantic Search** | Finding content by meaning similarity, not just keyword matching |

## Prerequisites

Before using Knowledge Base, ensure you have completed one of the following setups:

- **[Stack Installation](https://devopstoolkit.ai/docs/stack)** (recommended) - Installs all components including the controller, AI Engine, and Qdrant
- **[Deployment Guide](../setup/deployment.md)** - Individual component installation with integrated Qdrant

Both setups include the required Vector DB (Qdrant). You also need an embedding provider API key - see [Embedding Provider Configuration](../setup/deployment.md#embedding-provider-configuration).

## Knowledge Base Operations

The `manageKnowledge` tool supports three operations: `ingest`, `search`, and `deleteByUri`.

### Ingesting Documents

There are two ways to ingest documents into the knowledge base:

#### Option 1: Controller (Recommended for Git Repositories)

For documentation stored in Git repositories, use the [dot-ai-controller](https://devopstoolkit.ai/docs/controller/knowledge-source-guide). Create a `KnowledgeSource` CR pointing to your repo, and the controller automatically:
- Syncs markdown files from specified paths
- Keeps the knowledge base up to date on a schedule
- Handles updates and deletions automatically

This is "set and forget" - once configured, your Git documentation stays in sync.

#### Option 2: Via AI Agent (For Ad-Hoc Ingestion)

For documents outside Git, or when you need to quickly add something, use your AI coding agent (Claude Code, Cursor, etc.). Simply ask it to ingest content in natural language.

**What you can ingest:**
- **Local files**: Point to files in your project or filesystem
- **Pasted text**: Copy-paste content directly into the chat
- **Multiple documents**: Ask the agent to ingest several files at once
- **Any text format**: Not limited to markdown - any text content works

**Example**:
```text
Ingest docs/guides/mcp-recommendation-guide.md
```

**Response**:
```text
Successfully ingested docs/guides/mcp-recommendation-guide.md into the knowledge base.
The document was split into 33 chunks and stored with URI
https://github.com/vfarcic/dot-ai/blob/main/docs/guides/mcp-recommendation-guide.md.
```

**What happened behind the scenes:**
- AI assistant read the file content
- Constructed the full URI from the file path
- Called `manageKnowledge` with `operation: "ingest"`
- Document was chunked (~1000 characters per chunk) and stored with embeddings

### Searching the Knowledge Base

Search for relevant information using natural language queries. The system finds semantically similar content and synthesizes an answer.

**Example**:
```text
Search knowledgebase to explain how dot-ai recommendations work.
```

**Response**:
```text
How dot-ai Recommendations Work

The dot-ai recommendation system provides AI-powered Kubernetes deployment
recommendations through a multi-stage workflow:

Core Mechanism

1. Intent Refinement - When a user provides a vague intent (e.g., "deploy my app"),
   the system provides guidance for the client agent (Claude Code, Cursor, etc.)
   to analyze the project and gather details before proceeding.
2. Semantic Capability Matching - Instead of treating CRDs like
   sqls.devopstoolkit.live as meaningless names, the system understands what
   capabilities each resource provides through semantic search.
3. Capability-Enhanced Discovery - When you say "I need a PostgreSQL database":
   - Semantic search finds resources with matching capability context
   - AI gets pre-filtered, semantically relevant resources
   - Optimal matches appear as top suggestions with rich context
4. Organizational Pattern Integration - Recommendations automatically include
   your team's best practices and standards stored as patterns.
5. Helm Fallback - When no cluster capability matches, the system searches
   ArtifactHub for Helm charts and presents installation options.

Workflow Stages

The recommendation flow uses these stages:
- recommend - Initial intent analysis and solution generation
- chooseSolution - Select from generated alternatives
- answerQuestion:required/basic/advanced/open - Guided configuration collection
- generateManifests - Creates ready-to-deploy Kubernetes YAML
- deployManifests - Applies resources to the cluster

Sources:
- https://github.com/vfarcic/dot-ai/blob/main/docs/guides/mcp-recommendation-guide.md
```

**What happened behind the scenes:**
- Query was embedded and matched against stored chunks by semantic similarity
- Relevant chunks were retrieved from the knowledge base
- AI synthesized a coherent answer from the chunks
- Source URIs were included for verification

### Deleting Documents

Remove all chunks for a document by its URI. This is useful when a document is updated (delete then re-ingest) or removed from the source.

> **Note**: For Git repositories, the [dot-ai-controller](https://devopstoolkit.ai/docs/controller/knowledge-source-guide) handles document lifecycle automatically - it detects changes, deletes outdated chunks, and re-ingests updated content.

**Example** (manual deletion):
```text
Delete the recommendation guide from the knowledge base
(URI: https://github.com/vfarcic/dot-ai/blob/main/docs/guides/mcp-recommendation-guide.md)
```

**Response**:
```text
Done. Deleted 33 chunks for the recommendation guide from the knowledge base.
```

**What happened behind the scenes:**
- All chunks matching the URI were found in the knowledge base
- Each chunk was deleted from the vector database
- The document is no longer searchable

## Troubleshooting

### Check Knowledge Base Status

To verify the knowledge base is working and see how many documents are stored:

```text
Show dot-ai status
```

Look for the `knowledgeBase` collection in the response:

```text
Collections

| Collection    | Status   | Documents |
|---------------|----------|-----------|
| knowledgeBase | ✅ Ready | 156       |
```

If the collection shows `⚠️ Not created`, no documents have been ingested yet. If it shows an error, check your Vector DB connection and embedding provider configuration.

## FAQ

**Q: How do I update a document?**
A: Simply re-ingest it. The system automatically deletes existing chunks for the URI before storing new ones.

**Q: How are documents chunked?**
A: Documents are split into chunks of approximately 1000 characters with 200 character overlap to preserve context across chunk boundaries.

**Q: Can I search across multiple repositories?**
A: Yes. All ingested documents are stored in the same knowledge base regardless of source. Search returns results from all sources, with URIs indicating the origin.

## See Also

- **[Deployment Guide](../setup/deployment.md)** - Server deployment and configuration
- **[Controller Knowledge Source Guide](https://devopstoolkit.ai/docs/controller/knowledge-source-guide)** - Automated Git repository ingestion
- **[Tools and Features Overview](overview.md)** - Browse all available tools
