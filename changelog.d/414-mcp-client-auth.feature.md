### MCP Client Outbound Authentication

MCP server connections now support authentication via two mechanisms:

- **Static token (`authProvider`)**: Bearer tokens from K8s Secrets, passed to the MCP SDK's native `authProvider` interface. Use for MCP-spec-compliant servers requiring JWT or API key auth.
- **Custom headers (`requestInit.headers`)**: JSON-encoded HTTP headers from K8s Secrets, passed via `requestInit`. Use for non-spec servers requiring custom auth headers.

Authentication is configured per MCP server in the Helm chart's `mcpServers` values. Credentials are always stored in K8s Secrets and injected as environment variables — never in ConfigMaps or Helm values.

No auth config = no auth = current behavior unchanged (backward compatible).
