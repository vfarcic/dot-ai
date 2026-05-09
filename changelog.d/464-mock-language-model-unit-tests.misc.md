**Mock-model unit tests for the Vercel AI provider**

Adds a `MockLanguageModelV3`-based test helper and the first happy-path
unit tests for `VercelProvider.sendMessage`. Provider response mapping and
prompt forwarding can now be exercised without API keys, network calls,
or live integration fixtures, complementing the existing per-provider
integration suite.
