## Preserve dex-credentials secret across Helm upgrades

Added `helm.sh/resource-policy: keep` to the `dex-credentials` secret so Helm preserves it across upgrades. Previously, each upgrade deleted and recreated the secret, but the Dex pod kept stale environment variables in memory — causing "invalid client_secret" errors until the pod was manually restarted.
