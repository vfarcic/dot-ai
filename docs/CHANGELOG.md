# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

<!-- towncrier release notes start -->

## [0.180.0] - 2026-01-15

### Features

- **Web UI Visualizations for All Tools**

  All MCP tools now generate visualization URLs that transform complex JSON responses into intuitive visual dashboards. Previously, tool responses were JSON-only, requiring users to mentally parse technical output to understand what happened.

  The `recommend` tool displays solution comparison cards with scores, resource topology diagrams showing what each solution would create, and pattern/policy usage tables. The `remediate` tool renders investigation flowcharts showing the diagnostic path taken, root cause cards with confidence levels, and risk-colored action cards (green/yellow/red) for proposed remediations. The `operate` tool provides change summary cards with create/update/delete counts, before/after topology diffs, and syntax-highlighted command previews. The `version` tool shows system health as a dashboard with status indicators for each component, connection tables, and capability summaries. Multi-session visualizations are supported—when comparing multiple solutions, a single URL displays all of them together.

  Set `WEB_UI_BASE_URL` to your dot-ai-ui instance URL to enable visualizations. Each tool response then includes a `visualizationUrl` field. Open it in your browser to see the rendered dashboard. Use `?reload=true` on any visualization URL to regenerate it after session state changes—useful for seeing updated results after executing a remediation or operation.

  See the [Recommendation Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-recommendation-guide), [Remediation Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-remediate-guide), [Operate Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-operate-guide), and [Version Guide](https://devopstoolkit.ai/docs/mcp/guides/mcp-version-guide) for examples and screenshots. ([#320](https://github.com/vfarcic/dot-ai/issues/320))
