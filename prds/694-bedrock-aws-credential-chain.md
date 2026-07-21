# PRD #694: AWS Credential Provider Chain for Amazon Bedrock on EKS

## Status

Draft

## Problem

When dot-ai runs on EKS with `AI_PROVIDER=amazon_bedrock`, secretless AWS authentication (EKS Pod Identity, IRSA) does not work. Operators are forced to inject long-lived static access keys, which the requesting issue (#694) explicitly wants to avoid because they require manual rotation.

### Root cause (verified against the installed SDK)

`@ai-sdk/amazon-bedrock@4.0.117` does **not** use the AWS SDK v3 credential chain. It signs requests with `aws4fetch` and its only auth-related dependencies are `aws4fetch` + `@smithy/*` — there is no `@aws-sdk/credential-provider-*` in its dependency tree.

Reading `createAmazonBedrock()` in the SDK (`node_modules/@ai-sdk/amazon-bedrock/dist/index.js`), when no `apiKey`/`AWS_BEARER_TOKEN_BEDROCK` and no `credentialProvider` are supplied, credentials are resolved **only** from three env vars, read directly:

- `AWS_ACCESS_KEY_ID` (required — throws if missing)
- `AWS_SECRET_ACCESS_KEY` (required — throws if missing)
- `AWS_SESSION_TOKEN` (optional)

There is **no** walk of `~/.aws/credentials`, EC2 instance profile (IMDS), ECS task role, EKS Pod Identity, or IRSA web-identity token. The only hook that enables any of those is the `credentialProvider` option, which dot-ai does not currently pass.

### The current code (and PRD #175) claim behavior that never existed

Both call sites carry a comment asserting the AWS SDK "automatically uses credential chain" including "IAM roles (EC2 instance profiles, ECS roles, EKS service accounts)":

- `src/core/providers/vercel-provider.ts:229-237` (LLM)
- `src/core/embedding-service.ts:148-156` (embeddings)

This is false for this SDK. PRD #175 recorded the same intent ("Leverages AWS SDK credential chain", "Env vars → ~/.aws/credentials → IAM role") as a design decision, but the credential-chain portion was never actually implemented. This PRD closes that gap and corrects the record.

## Solution

Pass an explicit AWS credential provider so the SDK resolves credentials through the standard AWS chain (env vars → shared config/credentials files → web-identity/IRSA → container credentials/Pod Identity → EC2 instance profile):

```typescript
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

provider = createAmazonBedrock({
  region: process.env.AWS_REGION || 'us-east-1',
  credentialProvider: fromNodeProviderChain(),
});
```

The same change applies to the embeddings path in `embedding-service.ts` (Titan embeddings on EKS have the identical limitation).

### Why this is correct for expiring credentials

`createSigV4FetchFunction` invokes the credential provider **on every signed request** (`dist/index.js:2020`). `fromNodeProviderChain()` returns a memoized provider that caches credentials and auto-refreshes STS/web-identity tokens before expiry. Constructing it **once** at provider init and letting the SDK call it per-request means short-lived IRSA/Pod Identity credentials (~1h) refresh transparently. No startup penalty either: credentials resolve lazily on first model call, so nothing fails at construction when not running on AWS.

### Backward compatibility (non-negotiable)

- **Static env-var keys keep working** — `fromNodeProviderChain()` checks `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` first, matching today's behavior.
- **Bearer-token auth unaffected** — `AWS_BEARER_TOKEN_BEDROCK`/`apiKey` takes precedence in the SDK; `credentialProvider` is only consulted on the SigV4 branch.
- **Region behavior unchanged** — still `AWS_REGION` with a `us-east-1` default.

## Helm chart support

For the two recommended secretless paths (verified against `charts/`):

- **EKS Pod Identity** (preferred) — role↔ServiceAccount association is created out-of-band (`aws eks create-pod-identity-association`). The Pod Identity Agent injects container-credentials env vars; the chain resolves them. **No chart change required** (the chart already provides a stable ServiceAccount name).
- **IRSA** — needs `eks.amazonaws.com/role-arn` on the ServiceAccount. Today the chart only annotates the SA via **global** `.Values.annotations` (`charts/templates/serviceaccount.yaml`), which would smear the annotation onto every resource. Add a dedicated `serviceAccount.annotations` value.

Both should set `AWS_REGION` (via existing `extraEnv`, or a small `ai.aws.region` convenience value).

Optional (general flexibility, not the headline auth story): add `extraVolumes`/`extraVolumeMounts` so a `~/.aws/credentials` or `~/.aws/config` Secret can be mounted. The chart has no volume passthrough today — `charts/templates/deployment.yaml:287-311` only mounts the plugins/mcp-servers ConfigMaps.

## Scope

**In scope**

1. `credentialProvider: fromNodeProviderChain()` in `vercel-provider.ts` (LLM) and `embedding-service.ts` (embeddings).
2. Add `@aws-sdk/credential-providers` dependency (Pod Identity needs the resolved AWS SDK v3 packages `>= 3.458.0`; current releases far exceed this).
3. Correct the misleading credential-chain comments in both files.
4. `serviceAccount.annotations` Helm value (IRSA).
5. Unit tests asserting `credentialProvider` is passed on both the LLM and embedding paths.
6. Documentation: EKS Pod Identity + IRSA setup in `docs/ai-engine/setup/deployment.md`.

**Out of scope**

- Creating/managing IAM roles, trust policies, or Pod Identity associations (operator responsibility, documented not automated).
- Making a mounted `~/.aws/credentials` Secret the primary auth path — it reintroduces the long-lived-key rotation problem #694 set out to avoid, and offers nothing over static env-var keys, which already work.
- `extraVolumes`/`extraVolumeMounts` (nice-to-have; include only if cheap).
- Telemetry provider auto-detection tweak (`src/core/telemetry/config.ts:47` infers `amazon_bedrock` from `AWS_ACCESS_KEY_ID`, absent under Pod Identity/IRSA) — minor, only a fallback when `AI_PROVIDER` is unset; note but defer.

## Success Criteria

- dot-ai on EKS authenticates to Bedrock via Pod Identity **and** via IRSA with **no** static AWS keys, for both generation and (if configured) Bedrock embeddings.
- Existing static-key and bearer-token deployments continue to work unchanged.
- Expiring IRSA/Pod Identity credentials refresh without pod restarts over a multi-hour session.
- Code comments and docs accurately describe how credentials are resolved.

## Milestones

- [ ] **M1 — Credential chain wiring.** Add `credentialProvider: fromNodeProviderChain()` to `vercel-provider.ts` and `embedding-service.ts`; add `@aws-sdk/credential-providers` dependency; replace the inaccurate credential-chain comments with a correct description. Region behavior unchanged.
- [ ] **M2 — Helm IRSA support.** Add `serviceAccount.annotations` (rendered onto the ServiceAccount only) and document Pod Identity (no chart change) vs IRSA (annotation). Optionally add `ai.aws.region` and `extraVolumes`/`extraVolumeMounts`.
- [ ] **M3 — Tests.** Unit tests asserting `createAmazonBedrock` receives a `credentialProvider` on both the LLM and embedding paths, plus backward-compat coverage (static env-var path still constructs a working provider). `npm run test:integration` green.
- [ ] **M4 — Documentation.** EKS Pod Identity + IRSA setup in `docs/ai-engine/setup/deployment.md`; correct the "AWS credentials" rows to distinguish static keys vs secretless workload identity. Changelog fragment in `changelog.d/`.
- [ ] **M5 — Validation.** Validate Bedrock generation + embeddings against real credentials (env-var path locally / via CI; secretless path validated on EKS or documented as operator-verified).

## Confirmed decisions

1. **Which secretless mechanism** do you target — EKS Pod Identity, IRSA, or both? (The fix covers both; this shapes what we validate and document first.)
Both. Pod Identity is our long-term target (zero secrets, native IAM), but IRSA is the interim path we are already deploying while the fromNodeProviderChain() fix is pending. Supporting both in the same credential chain means we can transition without a second code change.

2. **Do you need Bedrock embeddings** (Titan) under the same workload identity, or only the LLM? (Determines whether M-embeddings validation is required or nice-to-have.)
Nice-to-have, not required. Our current plan uses local embeddings (HuggingFace TEI, zero-config), so the LLM path is the priority. Titan embeddings under the same workload identity would be a welcome addition but not a blocker.

3. **Is secretless sufficient**, or do you also need a mounted `~/.aws/credentials`/`~/.aws/config` Secret (e.g. for a `credential_process` or SSO profile)? That's what would justify the optional `extraVolumes` work.
Secretless is sufficient for our production deployment. However, I can see a use case where someone running dot-ai locally (e.g., on kind with a static token) would want to inject AWS credentials via a mounted Secret or environment variables. Since fromNodeProviderChain() falls back to env vars (AWS_ACCESS_KEY_ID, AWS_SESSION_TOKEN) when no Pod Identity or IRSA is present, this should work out of the box with no extra configuration — which is ideal.

4. **Region**: set via existing `extraEnv` (`AWS_REGION`), or would a dedicated `ai.aws.region` chart value be preferable?
Yes, extraEnv is perfectly fine. No need for a dedicated ai.aws.region value.