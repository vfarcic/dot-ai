**PRD: MCP Client Outbound Authentication (v4.0 — Shipped)**

Product Requirements Document for authenticating outbound MCP server
connections. Covers static tokens (`StaticTokenAuthProvider`), custom headers
(`requestInit`), and OAuth `client_credentials` flows. All milestones shipped
in v1.15.0 via PR #417. Validated in production with OAuth auth to Context Forge
MCP server (88 tools discovered).