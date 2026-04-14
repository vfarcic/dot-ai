### Fix Custom Endpoint + Local Embeddings Compatibility (#465)

Fixed Helm chart deployment failure when both `customEndpoint` and `localEmbeddings` are enabled. Kubernetes rejected the deployment due to duplicate `CUSTOM_EMBEDDINGS_BASE_URL` and `CUSTOM_EMBEDDINGS_API_KEY` environment variables. Local embeddings now takes precedence for embeddings-related vars while custom endpoint continues to control LLM vars.
