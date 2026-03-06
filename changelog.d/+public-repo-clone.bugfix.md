## Fix user prompts loading from public git repositories

User prompts from public git repositories now load correctly without requiring authentication. Previously, the shared `cloneRepo` function always required a PAT or GitHub App credentials, causing public repos configured via `DOT_AI_USER_PROMPTS_REPO` to fail with "No authentication method configured". The clone and pull functions now fall back to unauthenticated access when no credentials are set.
