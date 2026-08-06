## The Server's Git Credential No Longer Follows a Caller-Supplied URL

**Breaking change.** `pushToGit`, the per-request prompts override (`?repo=`), and `remediate`'s
repository clone all act on a URL that comes from — or is influenced by — the caller, and the server
attached its own `DOT_AI_GIT_TOKEN` (or a freshly minted GitHub App installation token) to whatever URL
it was handed. It no longer does. The credential now travels only to a repository whose URL is
`https://` and whose host appears in the new `gitops.allowedRepoHosts` Helm value, which defaults to
`["github.com"]`. Both conditions, not either.

The consequence differs per caller, deliberately. `pushToGit` **refuses** the request — direct push and
pull request mode alike — before any credential is minted, cloned with, or pushed with. The prompts
override and remediate **degrade instead of refusing**: the clone still happens, just unauthenticated,
so every public repository on every host keeps working and only a *private* one loses access. The
prompts override explains itself when it fails — the error names which half refused it, host or scheme,
and gives the remedy for that half — but a gated cache *refresh* does not fail at all, it keeps serving
the cached copy, so watch the server log for `Withholding the server git credential from this pull`.

For the prompts override, only an `http://` URL reaches that degradation: `ssh://`, `git://` and
`file://` have always been rejected with `HTTP 400` by input validation and still are. And where a
scheme is what refused the credential, the message says so rather than blaming the allowlist, because
no chart value fixes an `http://` URL — send the repository's `https://` clone URL instead. The
`X-Dot-AI-Git-Token` request header still bypasses the allowlist for the prompts override and is the
right remedy for an unlisted host; it is *not* the remedy for an `http://` URL, since it would put your
own token on a cleartext request.

Separately, and new in this release, the prompts override now **refuses a non-public destination
outright** — `HTTP 400`, before anything is fetched — when the `?repo=` host is an IP literal in a range
that is never a public prompts source: loopback, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
link-local `169.254.0.0/16` (the cloud metadata endpoint), `0.0.0.0/8`, `255.255.255.255`, and on IPv6
`::1`, `::`, `fe80::/10`, `fc00::/7` plus IPv4-mapped forms. Alternate spellings do not slip past it
(decimal, hex, octal, `127.1`, a bare `0`, a trailing dot, a port, userinfo), and an
`X-Dot-AI-Git-Token` does not soften it — this decides whether the fetch happens at all, not whose
credential travels. The check classifies **literals only and performs no DNS**, so a hostname that
resolves to an internal address still reaches the clone: keep an upstream gate in front of the endpoint
if untrusted clients can reach it. Requests using `?repo=` against an internal IP address stop working
on upgrade; `DOT_AI_USER_PROMPTS_REPO` is unaffected, so an operator-configured in-cluster prompts
repository on a private address keeps working exactly as before.

Deployments that only ever use `https://` github.com URLs are unaffected by the default. Everyone else
adds their hosts explicitly, for example
`--set-json 'gitops.allowedRepoHosts=["github.com","gitlab.example.com"]'`. Note the asymmetry: an
unset value falls back to `["github.com"]`, while an empty list — or `gitops: null` — is read as an
explicit deny-all, never as "not configured". And `DOT_AI_GIT_TOKEN` is not a GitHub-only credential:
the server sends it as the HTTP basic-auth password under `x-access-token`, which is how GitLab and
Gitea/Forgejo accept a PAT, so a token for one of those hosts did authenticate before this release.

See the [GitOps Repository Host Allowlist](https://devopstoolkit.ai/docs/mcp/ai-engine/setup/deployment#gitops-repository-host-allowlist)
for matching rules and the unset-vs-empty semantics,
[Shared Prompt Library](https://devopstoolkit.ai/docs/mcp/ai-engine/tools/prompts#the-server-credential-and-the-host-allowlist)
for the prompts-override walkthrough and what the override fetch still exposes, and
[Authorization](https://devopstoolkit.ai/docs/mcp/ai-engine/setup/authorization) for the upgrade path.
