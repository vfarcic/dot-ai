### Custom AI provider base URL now works through the Helm chart (#474)

Two fixes so a custom OpenAI-compatible LLM endpoint can be configured end-to-end via Helm:

- `AI_PROVIDER=custom` is now a first-class provider — `PROVIDER_ENV_KEYS` maps it to `CUSTOM_LLM_API_KEY`, so the MCP server no longer falls back to `NoOpProvider` when `ai.provider: custom` is set.
- The Helm chart now omits the `AI_PROVIDER` env var when `ai.provider` is empty, restoring the auto-detect path that selects the `custom` provider whenever `customEndpoint.enabled: true` is configured.

The default (`ai.provider: anthropic`) is unchanged. Users with a custom endpoint can pick whichever style they prefer: explicit (`ai.provider: custom`) or auto-detect (`ai.provider: ""`).
