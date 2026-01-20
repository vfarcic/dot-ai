# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

<!-- towncrier release notes start -->

## [0.194.0] - 2026-01-20

No significant changes.


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
