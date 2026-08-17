**Copilot test token gating**

The live Copilot credential test now runs only when the environment contains a
supported OAuth or GitHub App token, so unrelated personal access tokens no
longer cause the local unit suite to fail.
