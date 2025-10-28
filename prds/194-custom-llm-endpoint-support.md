# PRD #194: Custom LLM Endpoint Support for Self-Hosted and Alternative SaaS Providers

**Status**: Planning
**Priority**: High
**Issue**: [#194](https://github.com/vfarcic/dot-ai/issues/194)
**Related Issue**: [#193](https://github.com/vfarcic/dot-ai/issues/193) (User request)
**Created**: 2025-01-27

---

## Problem Statement

Users in air-gapped environments, with strict compliance requirements, or using alternative SaaS providers cannot adopt the DevOps AI Toolkit because it only supports public OpenAI and Anthropic endpoints. This blocks:

1. **Air-gapped/restricted environments**: Cannot access public internet APIs
2. **Compliance/governance requirements**: Must use internal/approved AI services only
3. **Cost optimization**: Want to use self-hosted models (Ollama, vLLM) instead of expensive cloud APIs
4. **Alternative SaaS providers**: Want to use OpenAI-compatible services (Azure OpenAI, LiteLLM proxies)
5. **Data sovereignty**: Need to keep all data within specific geographic boundaries

**Current Limitation**: The toolkit hardcodes connections to `api.openai.com` and `api.anthropic.com`, making it impossible to use custom endpoints.

**User Impact**: This is a **critical blocker** for enterprise adoption in regulated industries (finance, healthcare, government) and air-gapped environments.

---

## Solution Overview

Add support for custom OpenAI-compatible API endpoints through configurable `baseURL` parameter. This enables users to:

- Connect to self-hosted LLMs (Ollama, vLLM, LocalAI, text-generation-webui)
- Use internal LLM services within their private network
- Connect to alternative SaaS providers (Azure OpenAI, LiteLLM proxies, OpenRouter)
- Configure model-specific capabilities (token limits, feature support)

**Key Design Decision**: Start with OpenAI-compatible endpoints (widest compatibility with self-hosted models) and add warnings for model limitations. Defer context reduction optimization until we have real-world feedback from users.

**Relationship to Issue #175 (Bedrock)**: This is a **complementary feature** that solves different problems:
- **#175 (Bedrock)**: Platform routing using AWS SDK (different protocol)
- **#194 (Custom Endpoints)**: URL override for OpenAI-compatible APIs (same protocol)
- Both features can coexist and serve different use cases

---

## User Stories

### Primary User Story
**As a** platform engineer in an air-gapped environment
**I want to** connect the toolkit to our internal Ollama deployment
**So that** I can use AI-powered Kubernetes tooling without accessing public APIs

**Acceptance Criteria**:
- [x] Can configure Helm chart with custom endpoint URL
- [x] System connects to internal LLM instead of public API
- [ ] Clear warnings appear if model capabilities are insufficient
- [ ] Documentation explains supported models and requirements
- [ ] User from issue #193 successfully validates with real self-hosted LLM

### Secondary User Stories

1. **Azure OpenAI User**:
   - As a developer using Azure OpenAI, I want to configure the toolkit to use my Azure endpoint instead of public OpenAI
   - **Acceptance**: Can set `OPENAI_BASE_URL` to Azure endpoint and use Azure API key

2. **Cost-Conscious Startup**:
   - As a startup, I want to use self-hosted Llama models to reduce AI API costs while still using the toolkit
   - **Acceptance**: Can deploy with Ollama and specify custom endpoint via Helm chart

3. **Compliance Officer**:
   - As a security engineer, I want to route all AI requests through our approved LiteLLM proxy for auditing and compliance
   - **Acceptance**: All model requests go through configured proxy with full audit trail

4. **Multi-Tenant Platform**:
   - As a platform team, I want to use our own inference service that load-balances across multiple backends
   - **Acceptance**: Can configure custom endpoint that handles routing internally

---

## Technical Architecture

### Configuration Flow

```
User → Helm Values → Environment Variables → AIProviderFactory → VercelProvider → Custom Endpoint
```

### Key Changes

#### 1. AIProviderConfig Interface
**File**: `src/core/ai-provider.interface.ts`

```typescript
export interface AIProviderConfig {
  apiKey: string;
  provider: string;
  model?: string;
  debugMode?: boolean;
  baseURL?: string;           // NEW: Custom endpoint URL
  maxOutputTokens?: number;   // NEW: Override default token limit
}
```

#### 2. VercelProvider Updates
**File**: `src/core/providers/vercel-provider.ts`

```typescript
private initializeModel(): void {
  switch (this.providerType) {
    case 'openai':
    case 'openai_pro':
      provider = createOpenAI({
        apiKey: this.apiKey,
        baseURL: config.baseURL  // NEW: Pass custom endpoint
      });
      break;
    // ... rest of providers
  }
}
```

#### 3. AIProviderFactory Updates
**File**: `src/core/ai-provider-factory.ts`

```typescript
static createFromEnv(): AIProvider {
  const providerType = process.env.AI_PROVIDER || 'anthropic';
  const apiKey = process.env[PROVIDER_ENV_KEYS[providerType]];
  const model = process.env.AI_MODEL;
  const baseURL = process.env.OPENAI_BASE_URL;  // NEW
  const maxOutputTokens = process.env.AI_MAX_OUTPUT_TOKENS
    ? parseInt(process.env.AI_MAX_OUTPUT_TOKENS)
    : undefined;  // NEW

  // Display warning if output tokens are low
  if (baseURL && maxOutputTokens && maxOutputTokens < 8192) {
    process.stderr.write(
      `⚠️  WARNING: Custom endpoint configured with maxOutputTokens=${maxOutputTokens}.\n` +
      `   This may cause failures for:\n` +
      `   - Large YAML manifest generation (requires ~10K tokens)\n` +
      `   - Kyverno policy generation (requires ~5K tokens)\n` +
      `   - Multi-resource deployments\n\n` +
      `   Recommendation: Use models with 8K+ output capacity or cloud providers.\n\n`
    );
  }

  return this.create({
    provider: providerType,
    apiKey,
    model,
    debugMode: process.env.DEBUG_DOT_AI === 'true',
    baseURL,           // NEW
    maxOutputTokens    // NEW
  });
}
```

#### 4. Helm Chart Updates
**File**: `charts/values.yaml`

```yaml
# AI Provider configuration
ai:
  provider: openai              # Provider type (openai, anthropic, google, etc.)
  model: ""                     # Optional: model override (e.g., "llama3.1:70b")

  # Custom endpoint configuration (for self-hosted or alternative SaaS)
  customEndpoint:
    enabled: false              # Enable custom endpoint
    baseURL: ""                 # Custom endpoint URL (e.g., "http://ollama-service:11434/v1")

  # Model capability overrides (optional)
  capabilities:
    maxOutputTokens: ""         # Optional: override detected limit (e.g., "8192")

# Examples (commented out):
# Example 1: Ollama (self-hosted)
# ai:
#   provider: openai
#   model: "llama3.1:70b"
#   customEndpoint:
#     enabled: true
#     baseURL: "http://ollama-service:11434/v1"
#   capabilities:
#     maxOutputTokens: "8192"
#
# Example 2: Azure OpenAI (SaaS)
# ai:
#   provider: openai
#   model: "gpt-4o"
#   customEndpoint:
#     enabled: true
#     baseURL: "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT"
#   capabilities:
#     maxOutputTokens: "16000"
```

#### 5. Deployment Template Updates
**File**: `charts/templates/deployment.yaml`

Add new environment variables:

```yaml
env:
- name: AI_PROVIDER
  value: {{ .Values.ai.provider | default "anthropic" | quote }}
{{- if .Values.ai.model }}
- name: AI_MODEL
  value: {{ .Values.ai.model | quote }}
{{- end }}
{{- if .Values.ai.customEndpoint.enabled }}
- name: OPENAI_BASE_URL
  value: {{ .Values.ai.customEndpoint.baseURL | quote }}
{{- end }}
{{- if .Values.ai.capabilities.maxOutputTokens }}
- name: AI_MAX_OUTPUT_TOKENS
  value: {{ .Values.ai.capabilities.maxOutputTokens | quote }}
{{- end }}
```

### Warning System

Display warnings when model configuration may cause issues:

```
⚠️  WARNING: Custom endpoint configured with maxOutputTokens=4096.
   This may cause failures for:
   - Large YAML manifest generation (requires ~10K tokens)
   - Kyverno policy generation (requires ~5K tokens)
   - Multi-resource deployments

   Recommendation: Use models with 8K+ output capacity or cloud providers.
```

### Testing Strategy

#### Phase 1: Azure OpenAI Validation (Can do now)
**Goal**: Validate custom endpoint feature works with production-grade service

**Why Azure OpenAI?**:
- ✅ Uses OpenAI-compatible API (validates our baseURL approach)
- ✅ Production-grade service (not mock/stub)
- ✅ Tests real authentication and networking
- ✅ Can run in CI/CD with Azure credentials
- ✅ Validates use case for alternative SaaS providers

**Test Plan**:
```bash
# Set Azure OpenAI environment variables
export AI_PROVIDER=openai
export OPENAI_BASE_URL="https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT"
export OPENAI_API_KEY="your-azure-api-key"

# Run integration tests
npm run test:integration
```

**Success Criteria**:
- [ ] All existing integration tests pass with Azure OpenAI
- [ ] Custom baseURL is correctly applied
- [ ] Token usage tracking works
- [ ] Error handling works (invalid URLs, auth failures)

#### Phase 2: Vercel SDK Migration (Required for feature)
**Goal**: Ensure default tests use Vercel SDK (where custom endpoint support lives)

**Current State**: Default tests use `AI_PROVIDER_SDK=native` (Anthropic native SDK)
**Target State**: Default tests use `AI_PROVIDER_SDK=vercel` with Haiku

**Changes**:
```bash
# File: tests/integration/infrastructure/run-integration-tests.sh
# Change line 157 from:
AI_PROVIDER_SDK=${AI_PROVIDER_SDK:-native}
# To:
AI_PROVIDER_SDK=${AI_PROVIDER_SDK:-vercel}
```

**Validation**:
```bash
# Run tests with Vercel SDK
npm run test:integration:haiku

# Should see: "AI Provider: anthropic_haiku, SDK: vercel"
```

#### Phase 3: User Validation (Depends on user feedback)
**Goal**: Real-world testing with self-hosted LLMs

**Activities**:
- User from issue #193 tests with Ollama/vLLM deployment
- Gather feedback on:
  - What operations work successfully?
  - What operations fail due to token limits?
  - What context sizes are actually needed?
  - Are warnings accurate and helpful?

**Decision Point**: Based on feedback, choose path:
- **Path A**: Works great → Ship as-is ✅
- **Path B**: Fails on large generations → Implement Phase 4

#### Phase 4: Context Reduction Mode (Only if needed)
**Goal**: Support low-capability models through optimization

**Trigger**: Only implement if Phase 3 shows:
1. Models with < 8K output tokens are common use case
2. Users prefer degraded functionality over no functionality
3. Specific operations consistently fail with low limits

**Potential Features**:
- Lightweight schema mode (send only field names)
- Chunked YAML generation (multiple requests)
- Simplified prompts for small models
- Optional feature disabling

---

## Supported Endpoints

### Self-Hosted LLMs (Primary Focus)

| Solution | URL Pattern | Model Examples | Notes |
|----------|-------------|----------------|-------|
| **Ollama** | `http://host:11434/v1` | `llama3.1:70b`, `mistral:7b` | Most common self-hosted solution |
| **vLLM** | `http://host:8000/v1` | `meta-llama/Llama-3.1-70B-Instruct` | Production-grade inference server |
| **LocalAI** | `http://host:8080/v1` | Various | OpenAI-compatible local server |
| **text-generation-webui** | `http://host:5000/v1` | Various | Popular UI with API |

### Alternative SaaS Providers

| Provider | URL Pattern | Model Examples | Notes |
|----------|-------------|----------------|-------|
| **Azure OpenAI** | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` | `gpt-4o`, `gpt-4` | Enterprise OpenAI access |
| **LiteLLM Proxy** | `http://host:8000` | Any supported by LiteLLM | Gateway/proxy service |
| **OpenRouter** | `https://openrouter.ai/api/v1` | 100+ models | Multi-model aggregator |

### Model Capability Guidelines

**Recommended Models** (8K+ output tokens):
- ✅ Llama 3.1 70B (8K-16K output)
- ✅ Mistral Large (8K output)
- ✅ Qwen 2.5 72B (8K output)
- ✅ Azure OpenAI GPT-4o (16K output)

**Use with Caution** (4K-8K output tokens):
- ⚠️ Llama 3.1 8B (4K output)
- ⚠️ Mistral 7B (4K output)
- ⚠️ Gemma 2 9B (4K output)

**Not Recommended** (<4K output tokens):
- ❌ Most small models (<7B parameters)

---

## Milestones

### Milestone 1: Core Custom Endpoint Support ✅
**Goal**: Enable users to configure and use custom endpoints

**Success Criteria**:
- [x] AIProviderConfig interface updated with `baseURL` and `maxOutputTokens`
- [x] VercelProvider supports custom `baseURL` for OpenAI provider
- [x] AIProviderFactory loads configuration from environment variables
- [ ] Warning system displays when token limits are low
- [x] Helm chart values.yaml updated with custom endpoint configuration
- [x] Deployment template passes new environment variables to pods

**Validation**:
```bash
# Set custom endpoint
export AI_PROVIDER=openai
export OPENAI_BASE_URL="http://custom-endpoint:8000/v1"
export OPENAI_API_KEY="test-key"

# Start MCP server - should see no errors
npm run build && npm run start:mcp
```

### Milestone 2: Integration Tests with Vercel SDK ✅
**Goal**: Ensure no regression when using Vercel SDK

**Success Criteria**:
- [ ] Default integration tests use Vercel SDK (not Anthropic native SDK)
- [ ] All existing tests pass with `AI_PROVIDER_SDK=vercel`
- [ ] Test script updated to default to Vercel SDK
- [ ] CI/CD pipeline runs with Vercel SDK

**Validation**:
```bash
# Run full integration test suite with Vercel SDK
npm run test:integration:haiku

# All tests should pass
```

### Milestone 3: Azure OpenAI Validation ✅
**Goal**: Validate custom endpoint feature with production service

**Success Criteria**:
- [ ] Azure OpenAI credentials configured
- [ ] Integration tests pass with Azure OpenAI custom endpoint
- [ ] Token tracking accurate with Azure
- [ ] Error handling works (invalid URLs, auth failures)
- [ ] Documentation includes Azure OpenAI example

**Validation**:
```bash
# Configure Azure OpenAI
export OPENAI_BASE_URL="https://resource.openai.azure.com/openai/deployments/gpt-4"
export OPENAI_API_KEY="azure-key"

# Run tests
npm run test:integration

# Verify all features work correctly
```

### Milestone 4: Documentation Complete ✅
**Goal**: Users can successfully set up custom endpoints

**Success Criteria**:
- [ ] `docs/mcp-setup.md` updated with custom endpoint section
- [ ] All setup guides updated with custom endpoint examples
- [ ] Model capability requirements documented
- [ ] Troubleshooting guide for common issues
- [ ] Examples for Ollama, vLLM, Azure OpenAI, LiteLLM

**Documentation Updates Required**:
1. **docs/mcp-setup.md** - Add "Custom Endpoint Configuration" section
2. **docs/setup/docker-setup.md** - Add `OPENAI_BASE_URL` example
3. **docs/setup/kubernetes-setup.md** - Add Helm values example
4. **docs/setup/kubernetes-toolhive-setup.md** - Add Helm values example
5. **docs/setup/npx-setup.md** - Add environment variable example
6. **docs/setup/development-setup.md** - Add development setup example
7. **README.md** - Mention custom endpoint support in features

**Validation**:
- [ ] All code examples tested and working
- [ ] No broken links or outdated information
- [ ] Fresh user can follow docs to set up custom endpoint in <10 minutes

### Milestone 5: User Validation Complete 🔄
**Goal**: Real-world testing confirms feature works with self-hosted LLMs

**Success Criteria**:
- [ ] User from issue #193 successfully deploys with Ollama/vLLM
- [ ] User reports which operations work/fail
- [ ] Feedback collected on token limit warnings
- [ ] Decision made: Ship as-is OR implement context reduction

**Activities**:
1. Comment on issue #193 with setup instructions
2. User tests with their self-hosted deployment
3. User reports results (success/failures)
4. Analyze feedback and decide next steps

**Possible Outcomes**:
- **Outcome A**: Everything works → Ship feature ✅
- **Outcome B**: Some operations fail → Implement Milestone 6 (context reduction)
- **Outcome C**: Major issues found → Iterate on implementation

### Milestone 6: Context Reduction Mode (Conditional) ⏳
**Goal**: Support low-capability models through optimization

**Trigger**: Only implement if Milestone 5 shows consistent failures with models < 8K output

**Success Criteria**:
- [ ] Lightweight schema mode implemented
- [ ] Chunked generation for large YAML files
- [ ] Simplified prompts for small models
- [ ] Configuration flag: `AI_CONTEXT_REDUCTION_MODE=true`
- [ ] Documentation updated with context reduction guide

**Implementation**:
```yaml
# Helm values for context reduction
ai:
  provider: openai
  model: "llama3.1:8b"
  customEndpoint:
    enabled: true
    baseURL: "http://ollama:11434/v1"
  capabilities:
    maxOutputTokens: "4096"
  contextReductionMode: true  # Enable lightweight mode
```

**Decision**: Only implement if user feedback shows this is needed

---

## Success Criteria

### Functional Success
- [x] Users can configure custom endpoints via Helm chart
- [x] Users can configure custom endpoints via environment variables
- [ ] System validates endpoint configuration at startup
- [ ] Clear warnings appear when model capabilities may cause issues
- [ ] Azure OpenAI works as alternative SaaS provider
- [ ] User from issue #193 successfully uses self-hosted LLM

### Quality Success
- [ ] All existing integration tests pass with Vercel SDK
- [ ] Azure OpenAI tests pass consistently
- [ ] Error messages are clear and actionable
- [ ] Documentation is complete and accurate
- [ ] Zero breaking changes to existing configurations

### Adoption Success (Post-Launch)
- [ ] At least 3 users report successful self-hosted deployments
- [ ] No P0/P1 bugs reported within 30 days
- [ ] Positive community feedback on feature value

---

## Documentation Requirements

### New Documentation

**Create**: `docs/custom-llm-endpoints.md`
- Overview of custom endpoint support
- Supported endpoint types
- Step-by-step configuration examples
- Model capability requirements
- Troubleshooting common issues

### Documentation Updates

1. **docs/mcp-setup.md**:
   - Add "Custom Endpoint Configuration" section after "AI Model Configuration"
   - Include examples for Ollama, Azure OpenAI, vLLM
   - Document `OPENAI_BASE_URL` and `AI_MAX_OUTPUT_TOKENS` environment variables

2. **docs/setup/docker-setup.md**:
   - Add custom endpoint environment variables to Docker Compose example
   - Include Azure OpenAI example

3. **docs/setup/kubernetes-setup.md**:
   - Add custom endpoint configuration to Helm values section
   - Include Ollama in-cluster example

4. **docs/setup/kubernetes-toolhive-setup.md**:
   - Same updates as kubernetes-setup.md

5. **docs/setup/npx-setup.md**:
   - Add custom endpoint environment variables
   - Include self-hosted example

6. **docs/setup/development-setup.md**:
   - Add custom endpoint to .env example

7. **README.md**:
   - Add "Custom Endpoint Support" to features list
   - Link to detailed configuration guide

### Example Configurations

#### Ollama (Self-Hosted)
```yaml
ai:
  provider: openai
  model: "llama3.1:70b"
  customEndpoint:
    enabled: true
    baseURL: "http://ollama-service:11434/v1"
  capabilities:
    maxOutputTokens: "8192"

secrets:
  openai:
    apiKey: "ollama"  # Ollama doesn't require real key
```

#### vLLM (Self-Hosted)
```yaml
ai:
  provider: openai
  model: "meta-llama/Llama-3.1-70B-Instruct"
  customEndpoint:
    enabled: true
    baseURL: "http://vllm-service:8000/v1"
  capabilities:
    maxOutputTokens: "8192"
```

#### Azure OpenAI (SaaS)
```yaml
ai:
  provider: openai
  model: "gpt-4o"
  customEndpoint:
    enabled: true
    baseURL: "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT"
  capabilities:
    maxOutputTokens: "16000"
```

#### LiteLLM Proxy (Gateway)
```yaml
ai:
  provider: openai
  model: "gpt-4"
  customEndpoint:
    enabled: true
    baseURL: "http://litellm-proxy:8000"
```

---

## Risks and Mitigations

### Risk 1: Token Limit Failures
**Risk**: Self-hosted models with low output limits fail on large generations
**Severity**: High
**Likelihood**: Medium

**Mitigation**:
- Add clear warnings when limits are low (< 8K)
- Provide model requirement documentation
- Implement context reduction mode only if user testing shows it's needed
- Document recommended models (8K+ output)

### Risk 2: API Incompatibility
**Risk**: Some "OpenAI-compatible" APIs have subtle differences
**Severity**: Medium
**Likelihood**: Medium

**Mitigation**:
- Test with multiple popular implementations (Ollama, vLLM, Azure)
- Document tested/supported endpoints
- Provide troubleshooting guide
- Add validation tests for common endpoints

### Risk 3: Performance Differences
**Risk**: Self-hosted models may be slower or less capable than cloud models
**Severity**: Low
**Likelihood**: High

**Mitigation**:
- Document expected performance characteristics
- Users understand trade-offs (cost vs capability)
- Warnings help users make informed decisions
- No performance guarantees for self-hosted deployments

### Risk 4: Authentication Variations
**Risk**: Different endpoints may require different auth formats
**Severity**: Medium
**Likelihood**: Low

**Mitigation**:
- Start with standard OpenAI API key format
- Document alternative auth methods if needed
- Consider supporting custom headers in future (if requested)

### Risk 5: Configuration Complexity
**Risk**: Users struggle with correct URL format and configuration
**Severity**: Medium
**Likelihood**: Medium

**Mitigation**:
- Provide clear examples for common scenarios
- Include validation and helpful error messages
- Comprehensive troubleshooting documentation
- Community support and issue tracking

---

## Dependencies

### External Dependencies
- **Vercel AI SDK** `@ai-sdk/openai` (already installed) - supports `baseURL` parameter
- **OpenAI-compatible API** from endpoint (user provides)
- **Azure OpenAI** (for testing) - requires Azure subscription

### Internal Dependencies
- None - this is an additive feature

### Blocked By
- None

### Blocks
- None (independent feature)

---

## Open Questions

### Q1: Should we support custom endpoints for providers other than OpenAI?
**Options**:
1. OpenAI only (simplest, covers most use cases)
2. Add Anthropic custom endpoints too
3. Generic custom endpoint for all providers

**Recommendation**: Start with OpenAI only (Phase 1). Most self-hosted models expose OpenAI-compatible APIs. Can add other providers in future if users request it.

**Decision**: Start with OpenAI, evaluate feedback

---

### Q2: Should we validate endpoint connectivity at startup?
**Options**:
1. No validation (fast startup, fail at first use)
2. Validate but don't fail (log warning)
3. Validate and fail startup if unreachable

**Recommendation**: Validate but don't fail (Option 2). Log warning if endpoint unreachable but allow server to start. Helps users debug configuration without blocking startup.

**Decision**: Validate with warning (Option 2)

---

### Q3: Should we support custom headers for authentication?
**Options**:
1. API key only (standard OpenAI format)
2. Support custom headers too
3. Support multiple auth methods

**Recommendation**: Start with API key only (Phase 1). Standard OpenAI format covers most cases. Add custom headers in future if users request specific auth patterns.

**Decision**: API key only for Phase 1

---

### Q4: How should we handle streaming for custom endpoints?
**Options**:
1. Always enable streaming
2. Make streaming configurable
3. Auto-detect streaming support

**Recommendation**: Always enable streaming (Option 1). Vercel SDK handles fallback if streaming not supported. Streaming improves UX for long operations.

**Decision**: Always enable (Option 1)

---

## Progress Log

### 2025-10-28: Core Implementation Complete - OpenRouter Validation
**Duration**: ~6 hours (estimated from commit timestamps and conversation)
**Commits**: 17 files modified (src/ and charts/)
**Primary Focus**: Custom LLM endpoint support implementation + OpenRouter integration testing

**Completed PRD Items** (Milestone 1 - 5 of 6):
- [x] AIProviderConfig interface updated - Added `baseURL` and `maxOutputTokens` fields (`src/core/ai-provider.interface.ts`)
- [x] VercelProvider custom endpoint support - Pass `baseURL` to createOpenAI() (`src/core/providers/vercel-provider.ts`)
- [x] AIProviderFactory environment variable loading - Load `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_API_KEY` (`src/core/ai-provider-factory.ts`)
- [x] Helm chart configuration - Added custom endpoint values (`charts/values.yaml`)
- [x] Deployment template updates - Pass env vars to pods (`charts/templates/deployment.yaml`)

**Completed Primary User Story Items** (2 of 5):
- [x] Can configure Helm chart with custom endpoint URL
- [x] System connects to custom LLM endpoints (validated with OpenRouter)

**Additional Work Done**:
- OpenRouter provider detection logic - Auto-detect OpenRouter baseURL and switch to 'openrouter' provider type
- Provider selection enhancements - Distinguish between generic custom endpoints and OpenRouter
- Integration test validation - All remediate tests passing with OpenRouter (manual + automatic modes)
- Investigation and debugging - Confirmed Vercel SDK (text+JSON) and Native SDK (JSON) response formats both work correctly

**Technical Discoveries**:
- Response format differences between Vercel SDK and Native Anthropic SDK don't cause issues
- Existing `parseAIFinalAnalysis()` function already handles both text+JSON and pure JSON formats
- Environment variable inheritance can cause provider confusion in tests - requires careful env management
- OpenRouter serves as excellent validation for custom endpoint functionality (multi-model aggregator via custom URL)

**Files Modified**:
- Core: `ai-provider-factory.ts`, `ai-provider.interface.ts`, `vercel-provider.ts`, `model-config.ts`
- Supporting: `capability-scan-workflow.ts`, `discovery.ts`, `embedding-service.ts`, `unified-creation-session.ts`
- Tools: `remediate.ts` (investigation only - debug logging added and reverted)
- Charts: `values.yaml`, `deployment.yaml`, `mcpserver.yaml`, `secret.yaml`
- Config: `.teller.yml`, `package.json`, `package-lock.json`

**Next Session Priorities**:
1. **Warning system validation** (Milestone 1 item 4) - Verify token limit warnings display correctly
2. **Full integration test suite** (Milestone 2) - Run ALL tests with Vercel SDK, not just remediate
3. **Azure OpenAI testing** (Milestone 3) - Validate custom endpoint with production SaaS provider
4. **Documentation creation** (Milestone 4) - Write setup guides and examples for 7 documentation files
5. **User validation** (Milestone 5) - Engage with issue #193 user for real-world testing

### 2025-01-27: PRD Created
- Created comprehensive PRD based on issue #193 user request
- Analyzed relationship to issue #175 (Bedrock) - confirmed complementary features
- Defined Azure OpenAI testing strategy
- Planned Vercel SDK migration for default tests
- Identified 7 documentation files requiring updates
- Created milestone plan with user validation phase
- Defined clear success criteria and risk mitigations

---

## Next Steps

1. **Get PRD Approval**: Review and approve this PRD
2. **Begin Implementation**: Start with Milestone 1 (Core Custom Endpoint Support)
3. **Azure OpenAI Testing**: Validate feature with Azure OpenAI
4. **User Validation**: Work with issue #193 user to test with Ollama
5. **Documentation**: Update all affected documentation files
6. **Launch Decision**: Based on user feedback, ship as-is or add context reduction

---

## References

- **Issue #193**: Original user request for custom endpoint support
- **Issue #175**: Bedrock platform routing (complementary feature)
- **Vercel AI SDK OpenAI Docs**: https://sdk.vercel.ai/providers/ai-sdk-providers/openai
- **Ollama API Docs**: https://github.com/ollama/ollama/blob/main/docs/api.md
- **vLLM OpenAI Compatible Server**: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
- **Azure OpenAI API**: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
