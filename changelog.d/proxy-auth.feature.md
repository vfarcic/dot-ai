## Proxy-Compatible Authentication Header

The REST API now supports `X-Dot-AI-Authorization` as a fallback authentication header. When accessing the API through the Kubernetes API server proxy (e.g., from Headlamp or other dashboard plugins), the standard `Authorization` header is overwritten with a Kubernetes bearer token. Clients can now send their dot-ai token via `X-Dot-AI-Authorization: Bearer <token>` to bypass this limitation.

The fallback header is checked first; if absent, the standard `Authorization` header is used as before. Existing clients require no changes.
