**Local embeddings use the configured TEI model**

Helm deployments with local embeddings enabled now pass `localEmbeddings.model`
to the MCP server, preventing model-mismatch warnings on embedding requests.
