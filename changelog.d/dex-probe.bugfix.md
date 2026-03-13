## Dex Readiness Probe Timeout

Fixed intermittent Dex unhealthy events caused by an overly tight readiness probe timeout. The `/healthz/ready` endpoint queries the Kubernetes API server (CRD storage), which can exceed the previous 1-second timeout under normal cluster load. The default readiness probe now uses `timeoutSeconds: 5` and `failureThreshold: 5`, preventing false-positive unhealthy events during routine operations.
