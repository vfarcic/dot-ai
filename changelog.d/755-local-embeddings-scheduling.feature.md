**Pod scheduling options for the local embeddings Deployment**

`localEmbeddings` now supports `nodeSelector`, `affinity`, and `tolerations`
so the in-cluster TEI embedding service can be pinned to specific nodes,
constrained by affinity rules, or scheduled onto tainted nodes. All three
default to empty and are omitted from the rendered manifest when unset, so
existing deployments are unaffected.
