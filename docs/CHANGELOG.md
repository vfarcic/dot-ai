# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

<!-- towncrier release notes start -->

## [1.0.0] - 2026-01-28

### Bug Fixes

- **Reduced Excessive Logging During Circuit Breaker Events**

  Fixed excessive log spam that occurred when the embedding API circuit breaker was open, which previously generated 130MB+ of logs within minutes from a single container. This caused log storage to fill rapidly, overwhelmed log aggregation systems (triggering Loki rate limiting), and made it difficult to find important logs.

  The circuit breaker now logs "circuit open" warnings only once per open period instead of for every blocked request. Resource sync operations batch circuit breaker failures and log a summary count rather than individual warnings per resource. Per-resource progress logs during capability scans have been removed since progress is available via the dedicated progress endpoint. Command executor logging has been reduced to summary-level output.

  These changes reduce log volume by 99%+ during circuit breaker scenarios while preserving all operationally important information. ([#348](https://github.com/vfarcic/dot-ai/issues/348))

### Breaking Changes

- ## Kubernetes-Only Deployment

  dot-ai now requires Kubernetes for deployment. Docker Compose, npx, and local standalone deployment options have been removed, along with ToolHive and kagent integration. This simplifies the codebase and documentation by establishing a single, consistent deployment model.

  The MCP server now uses HTTP transport exclusively—stdio transport has been removed. Users who previously ran dot-ai locally with stdio must now deploy to a Kubernetes cluster and connect via HTTP. The `TRANSPORT_TYPE` environment variable is no longer supported.

  All setup documentation has been consolidated into a single guide. Users should follow the [MCP Setup Guide](https://devopstoolkit.ai/docs/mcp/setup/mcp-setup) for installation and configuration. The guide covers Helm deployment, AI provider configuration, embedding setup, and MCP client configuration for Claude Code, Cursor, and other clients. ([#345](https://github.com/vfarcic/dot-ai/issues/345))

### Other Changes

- **Modular Plugin Architecture for kubectl Tools**

  Kubernetes operations now run through a modular plugin system instead of being embedded in the MCP server core. This architectural change separates concerns, enables independent testing and deployment of kubectl tools, and lays the groundwork for user-provided plugins.

  The `agentic-tools` plugin package contains all kubectl tools (kubectl_get, kubectl_apply, kubectl_describe, kubectl_logs, kubectl_events, kubectl_api_resources, kubectl_exec_command, and more) running as an HTTP service. The plugin communicates with the MCP server via describe/invoke hooks, allowing tools to be discovered at startup and invoked during agentic loops or direct API calls. The version tool now shows discovered plugin information including tool counts.

  Plugin deployment is handled through the Helm chart. Plugins can be deployed by the chart (provide `image` + `port`) or registered externally (provide `endpoint` only). The MCP server itself no longer requires Kubernetes RBAC permissions since all cluster operations route through the plugin, which has its own ServiceAccount with appropriate permissions. ([#343](https://github.com/vfarcic/dot-ai/issues/343))


## [0.195.0] - 2026-01-23

### Features

- **Global Annotations Support in Helm Chart**

  Apply custom annotations to all Kubernetes resources deployed by the Helm chart through a single `annotations` entry in values.yaml. Previously, adding annotations for tools like Reloader or compliance requirements meant manually editing manifests after deployment, using post-render hooks, or maintaining kustomize overlays—all of which added maintenance burden and were lost on chart upgrades.

  The chart now supports a top-level `annotations` map that propagates to all rendered resources including Deployments, Services, ServiceAccounts, Secrets, RBAC resources, and pod templates. Pod template annotations are particularly important for Reloader integration, which watches for annotation changes to trigger rolling updates when ConfigMaps or Secrets change. For resources that already support their own annotations (Ingress, Gateway), global annotations merge with resource-specific ones, with resource-specific taking precedence on key conflicts.

  Configure global annotations in your values file:
  ```yaml
  annotations:
    reloader.stakater.com/auto: "true"
    company.com/managed-by: "platform-team"
  ```

  See the [Kubernetes Setup Guide](https://devopstoolkit.ai/docs/mcp/setup/kubernetes-setup) for configuration details. ([#336](https://github.com/vfarcic/dot-ai/issues/336))
- **Circuit Breaker for LLM API Rate Limits**

  Embedding operations now include circuit breaker protection to gracefully handle rate limits and API quota errors. Previously, when rate limits hit, dot-ai would retry rapidly without backoff, generating hundreds of identical errors and wasting API budget before failing.

  The circuit breaker monitors consecutive failures and temporarily blocks requests after 3 failures, giving the API time to recover. After a 30-second cooldown, it enters a half-open state to test if the service has recovered. Combined with the Vercel AI SDK's built-in exponential backoff (2s base delay with automatic `Retry-After` header support), this prevents cascading failures during sustained rate limit periods. Users see clear error messages when the circuit is open rather than repeated timeout errors.

  The circuit breaker works automatically with no configuration required. Monitor circuit breaker state using the `getCircuitBreakerStats()` function exposed from the embedding service. ([#337](https://github.com/vfarcic/dot-ai/issues/337))


## [0.194.1] - 2026-01-23

### Other Changes

- **Qdrant Query Performance Optimizations**

  Search operations in the Web UI are now significantly faster. Previously, keyword searches fetched up to 1000 documents from Qdrant and filtered them client-side in JavaScript, causing intermittent slowness as collections grew.

  Searches now use Qdrant's native text indexing for server-side filtering, reducing the data transferred and processed. Connection pooling (100 connections) eliminates connection recreation overhead, and increased concurrent operation limits (20 to 100) improve throughput for parallel requests. Existing collections automatically receive text indexes on upgrade without data loss or manual intervention. ([#338](https://github.com/vfarcic/dot-ai/issues/338))


## [0.194.0] - 2026-01-20

### Features

- **PostHog Telemetry for Usage Analytics**

  Anonymous usage telemetry helps improve dot-ai by tracking which tools are used, what errors occur, and which AI providers are popular. No personally identifiable information, queries, or cluster data is collected.

  Telemetry is enabled by default. Set `DOT_AI_TELEMETRY=false` to opt out. See the [Telemetry Guide](https://devopstoolkit.ai/docs/mcp/guides/telemetry-guide/) for full details on what's collected and privacy controls. ([#329](https://github.com/vfarcic/dot-ai/issues/329))


## [0.193.0] - 2026-01-16

### Features

- **Dashboard HTTP API Endpoints**

  Query Kubernetes resources programmatically with structured JSON responses for dashboard UIs. Previously, the only way to access cluster data was through the natural language `query` tool, which returns AI-synthesized summaries unsuitable for table rendering and programmatic access.

  New REST API endpoints provide everything dashboard developers need: `GET /api/v1/resources/kinds` lists all resource types with counts for sidebar navigation, `GET /api/v1/resources` returns filtered, paginated resource lists with optional live status from the Kubernetes API, and `GET /api/v1/resources/search` enables semantic search across all resources with relevance scores. Additional endpoints expose namespaces (`GET /api/v1/namespaces`), single resource details (`GET /api/v1/resource`), Kubernetes events (`GET /api/v1/events`), and pod logs (`GET /api/v1/logs`). The capability lookup now supports JSON-formatted queries (`{"kind":"Deployment","apiVersion":"apps/v1"}`) and returns printer columns for dynamic table generation matching `kubectl get` output.

  Session state persistence enables URL sharing and page refresh without re-running expensive AI queries. The `[visualization]` mode now returns a `sessionId`, and the new `GET /api/v1/sessions/{sessionId}` endpoint retrieves cached results in under 100ms.

  See the [Query Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-query-guide) and [Recommendation Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-recommendation-guide) for usage details. ([#328](https://github.com/vfarcic/dot-ai/issues/328))

### Other Changes

- **Towncrier Release Notes Infrastructure**

  Release notes now contain meaningful descriptions of what changed and why, instead of just artifact versions and changelog links. Previously, releases provided no context about new features, bug fixes, or breaking changes—users had to dig through commit history to understand what a release contained.

  The release workflow now uses towncrier to collect changelog fragments that accumulate as features merge, then combines them into rich release notes when a version is published. Contributors create simple markdown files in `changelog.d/` describing their changes, and the `/changelog-fragment` skill automates this during the `/prd-done` workflow. Release timing is now controlled—releases happen when maintainers push a version tag or trigger the workflow manually, not automatically on every merge.

  The release workflow supports two modes: full releases (tag push or manual trigger) publish all artifacts with generated notes, while notes-only mode updates release descriptions without republishing artifacts—useful for retroactive cleanup of existing releases. ([#331](https://github.com/vfarcic/dot-ai/issues/331))


## [0.180.0] - 2026-01-15

### Features

- **Web UI Visualizations for All Tools**

  All MCP tools now generate visualization URLs that transform complex JSON responses into intuitive visual dashboards. Previously, tool responses were JSON-only, requiring users to mentally parse technical output to understand what happened.

  The `recommend` tool displays solution comparison cards with scores, resource topology diagrams showing what each solution would create, and pattern/policy usage tables. The `remediate` tool renders investigation flowcharts showing the diagnostic path taken, root cause cards with confidence levels, and risk-colored action cards (green/yellow/red) for proposed remediations. The `operate` tool provides change summary cards with create/update/delete counts, before/after topology diffs, and syntax-highlighted command previews. The `version` tool shows system health as a dashboard with status indicators for each component, connection tables, and capability summaries. Multi-session visualizations are supported—when comparing multiple solutions, a single URL displays all of them together.

  Set `WEB_UI_BASE_URL` to your dot-ai-ui instance URL to enable visualizations. Each tool response then includes a `visualizationUrl` field. Open it in your browser to see the rendered dashboard. Use `?reload=true` on any visualization URL to regenerate it after session state changes—useful for seeing updated results after executing a remediation or operation.

  See the [Recommendation Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-recommendation-guide), [Remediation Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-remediate-guide), [Operate Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-operate-guide), and [Version Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-version-guide) for examples and screenshots. ([#320](https://github.com/vfarcic/dot-ai/issues/320))
