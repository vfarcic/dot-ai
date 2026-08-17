**Local embeddings use the configured TEI model**

Helm deployments with local embeddings enabled now pass the model name served by
TEI to the MCP server, including the prefetched model path, preventing
model-mismatch warnings on embedding requests.
