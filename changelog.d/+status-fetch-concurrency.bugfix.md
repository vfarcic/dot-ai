## Resource Status Fetch Concurrency Fix

The REST API's resource list endpoint now fetches live status in batches of 5 instead of all at once. Previously, requesting `includeStatus=true` for a list of N resources fired N concurrent `kubectl` calls simultaneously via the agentic-tools plugin, overwhelming the pod's CPU and causing liveness probe failures and repeated restarts. Status data now arrives incrementally while keeping the pod stable under load.
