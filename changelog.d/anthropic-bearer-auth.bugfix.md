## Anthropic Bearer Auth for Corporate Proxies

Corporate proxies fronting the Anthropic API that require `Authorization: Bearer` authentication now work correctly. Previously, the Anthropic SDK always sent credentials via the `x-api-key` header, causing `Unauthorized` errors when the proxy expected Bearer auth.

Including an `Authorization` header in `CUSTOM_LLM_HEADERS` (e.g., `'{"Authorization": "Bearer your-proxy-token"}'`) now automatically switches the Anthropic SDK to Bearer token mode. The token value from the header is used directly, and `x-api-key` is no longer sent. Other providers (OpenAI, Google, xAI) are unaffected as they already use Bearer auth by default.

Also removed the obsolete `anthropic-beta: context-1m-2025-08-07` header, which is no longer needed as 1M context is native to Claude Opus 4.6 and Sonnet 4.6.

See the [Deployment Guide](https://devopstoolkit.ai/docs/mcp/setup/deployment) for configuration details.
