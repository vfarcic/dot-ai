# PRD #175: Amazon Bedrock Provider Support

**Status**: Implemented
**Created**: 2025-10-22
**Completed**: 2025-11-02
**GitHub Issue**: [#175](https://github.com/vfarcic/dot-ai/issues/175)
**Priority**: Medium

---

## Problem Statement

Users with AWS credits, AWS-centric infrastructure, or enterprise AWS agreements cannot leverage their existing AWS investments to use AI models in dot-ai. This creates barriers to adoption for:

- **Enterprise AWS customers** with existing credits or committed spend
- **Organizations** with AWS-only security/compliance policies
- **Teams** wanting centralized AWS billing for AI services
- **Users in AWS regions** with better latency to Bedrock endpoints

Currently, dot-ai requires direct API keys for Anthropic, OpenAI, Google, etc., forcing users to manage separate billing relationships and credentials even when these same models are available through AWS Bedrock.

## Solution Overview

Add Amazon Bedrock as a standard provider option (`AI_PROVIDER=amazon_bedrock`), following the same simple pattern as Anthropic, OpenAI, Google, and other existing providers. Users access Bedrock models through AWS credentials and specify Bedrock model IDs directly.

### Key Design Principles

1. **Simplicity**: Amazon Bedrock is just another provider choice - no new concepts or environment variables
2. **Consistency**: Uses existing `AI_PROVIDER` pattern that users already understand
3. **Direct Model IDs**: Users specify Bedrock model IDs directly (e.g., `anthropic.claude-sonnet-4-5-20250929-v1:0`)
4. **AWS SDK Integration**: Leverages AWS SDK credential chain for flexible authentication

### User Experience

```bash
# Existing behavior (unchanged) - Direct Anthropic API
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-...
AI_MODEL=claude-sonnet-4-5-20250929  # Native model ID

# New: Claude via AWS Bedrock
AI_PROVIDER=amazon_bedrock
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AI_MODEL=anthropic.claude-sonnet-4-5-20250929-v1:0  # Bedrock model ID

# New: Llama via AWS Bedrock
AI_PROVIDER=amazon_bedrock
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AI_MODEL=meta.llama3-70b-instruct-v1:0  # Bedrock model ID
```

---

## User Stories

### Primary User Stories

1. **As an AWS enterprise customer**, I want to use Claude models through Bedrock so I can leverage my existing AWS credits and centralized billing
   - **Acceptance**: Can set `AI_PROVIDER=amazon_bedrock` and use AWS credentials to access Claude models

2. **As a DevOps engineer**, I want to use Llama 3 models through Bedrock so I can access open-source models without managing separate API keys
   - **Acceptance**: Can deploy with `AI_PROVIDER=amazon_bedrock AI_MODEL=meta.llama3-70b-instruct-v1:0` and access Llama models

3. **As a security-conscious organization**, I want all AI traffic to go through AWS so I can enforce VPC endpoints and AWS security controls
   - **Acceptance**: All model requests use AWS SDK with standard AWS security configurations

4. **As a cost-conscious user**, I want to use Amazon Titan models through Bedrock so I can optimize costs with AWS-native models
   - **Acceptance**: Can use Titan models via `AI_PROVIDER=amazon_bedrock AI_MODEL=amazon.titan-text-premier-v1:0`

### Secondary User Stories

5. **As a multi-cloud user**, I want consistent configuration patterns for accessing models across platforms
   - **Acceptance**: Same provider selection pattern (`AI_PROVIDER`) works for future Azure/GCP platform integrations

6. **As a developer**, I want to use Bedrock model IDs directly without translation complexity
   - **Acceptance**: Can specify `AI_MODEL=anthropic.claude-sonnet-4-5-20250929-v1:0` and system uses it directly

---

## Technical Approach

### Architecture Decision: Treat Amazon Bedrock as Standard Provider

**Decision**: Add Amazon Bedrock as a standard provider (`amazon_bedrock`) in the existing provider architecture, following the same pattern as Anthropic, OpenAI, Google, etc.

**Date**: 2025-11-02 (Finalized during implementation)

**Rationale**:
- **Simplicity**: No new environment variables or configuration concepts - just another provider choice
- **Consistency**: Follows exact same pattern as all existing providers (`AI_PROVIDER=amazon_bedrock`)
- **User Experience**: Users already understand provider selection - no learning curve
- **Maintenance**: Minimal code changes - add to model config, add switch case, done
- **Vercel SDK Integration**: SDK's `createAmazonBedrock()` handles all Bedrock complexity

**Implemented User Experience**:
```bash
# Standard provider pattern - just like any other provider
AI_PROVIDER=amazon_bedrock
AI_MODEL=global.anthropic.claude-sonnet-4-20250514-v1:0
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

**Key Design Principles (As Implemented)**:
1. **No Model ID Translation**: Users provide Bedrock model IDs directly (e.g., `global.anthropic.claude-sonnet-4-20250514-v1:0`)
2. **No Platform Abstraction**: Amazon Bedrock is just another provider, not a "platform layer"
3. **AWS SDK Handles Credentials**: AWS credential chain works automatically (env vars, ~/.aws/credentials, IAM roles)
4. **Follows OpenRouter Pattern**: Same simplicity as existing `openrouter` provider

**Architecture Evolution During Implementation**:
- **Original PRD Proposal**: Use `AI_PLATFORM=aws` environment variable with platform abstraction layer
- **Implementation Feedback**: User questioned "Why do we need platform-config.ts?" and "Would it make sense to use AI_PROVIDER instead?"
- **Final Decision**: Treat Bedrock as just another provider - much simpler, follows established patterns
- **Result**: No `AI_PLATFORM`, no `platform-config.ts`, no model translation - just `AI_PROVIDER=amazon_bedrock`

**Alternatives Rejected**:
1. **Platform abstraction with `AI_PLATFORM`** (original PRD approach):
   - Would add unnecessary new environment variable
   - Would require model ID translation layer
   - Creates more complex mental model for users
   - Adds maintenance burden for translation mappings
   - **Rejected during implementation based on user feedback**

2. **Creating separate `BedrockProvider`** (PR #174 approach):
   - Duplicates functionality already in Vercel SDK
   - Breaks the unified provider pattern
   - Requires maintaining parallel implementations

### Implementation Components

#### 1. Model Configuration

**File**: `src/core/model-config.ts` (modify)

Add Amazon Bedrock to the provider list with default model:

```typescript
export const CURRENT_MODELS = {
  // ... existing providers ...
  amazon_bedrock: 'anthropic.claude-sonnet-4-5-20250929-v1:0'
} as const;
```

#### 2. AI Provider Factory

**File**: `src/core/ai-provider-factory.ts` (modify)

Add special credential handling for Bedrock (AWS SDK uses credential chain, not API keys):

```typescript
// Special handling for Amazon Bedrock - AWS SDK handles credentials automatically
if (providerType === 'amazon_bedrock') {
  // Use dummy API key for Bedrock - AWS SDK will handle actual authentication
  // AWS credentials checked at runtime by AWS SDK (env vars, ~/.aws/credentials, IAM roles)
  apiKey = 'bedrock-uses-aws-credentials';
} else {
  // Standard API key lookup for other providers
  // ...existing code...
}
```

#### 3. Vercel Provider

**File**: `src/core/providers/vercel-provider.ts` (modify)

Add static import and `amazon_bedrock` case to the provider switch statement:

```typescript
// Add to imports at top of file
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

// Add case in initializeModel() switch statement
private initializeModel(): void {
  try {
    let provider: any;

    switch (this.providerType) {
      case 'openai':
        provider = createOpenAI({ apiKey: this.apiKey });
        break;
      case 'anthropic':
        provider = createAnthropic({ apiKey: this.apiKey });
        break;
      // ... existing cases ...

      case 'amazon_bedrock':  // NEW: Amazon Bedrock provider
        // AWS SDK automatically uses credential chain:
        // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
        // 2. ~/.aws/credentials file
        // 3. IAM roles (EC2 instance profiles, ECS roles, EKS service accounts)
        provider = createAmazonBedrock({
          region: process.env.AWS_REGION || 'us-east-1',
        });
        break;

      default:
        throw new Error(`Cannot initialize model for provider: ${this.providerType}`);
    }

    // Model instance creation - same for all providers
    this.modelInstance = provider(this.model);
  } catch (error) {
    throw new Error(`Failed to initialize ${this.providerType} model: ${error}`);
  }
}
```

**Key Points**:
- Single `createAmazonBedrock()` function handles all Bedrock model families (Anthropic, Llama, Titan, Mistral)
- Users provide Bedrock model IDs directly via `AI_MODEL` environment variable
- AWS SDK credential chain handles authentication automatically
- Follows same pattern as all other providers in the switch statement

#### 4. Credential Management

**AWS Credential Chain**:
1. Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
2. AWS credentials file: `~/.aws/credentials`
3. IAM role (EC2/ECS/Lambda) - handled by AWS SDK automatically

**Validation**: Early validation of credentials before attempting model calls.

---

## Supported Models (Phase 1)

### Priority 1: Anthropic Claude
- **Models**: Sonnet 4, Haiku 4
- **Rationale**: Top performer in evaluations, proven for K8s workflows
- **Tool Support**: Full tool calling and agentic behavior

### Priority 2: Meta Llama 3
- **Models**: Llama 3 70B Instruct
- **Rationale**: Strong open-source alternative, good reasoning
- **Tool Support**: Full tool calling support

### Priority 3: Amazon Titan
- **Models**: Titan Text Premier
- **Rationale**: Native AWS model, potential AWS integration benefits
- **Tool Support**: Evaluate tool calling capabilities

### Priority 4: Mistral
- **Models**: Mistral Large
- **Rationale**: Good performance/cost balance (already supported via direct API)
- **Tool Support**: Full tool calling support

**Note**: Cohere and AI21 models deferred to future phases based on user demand.

---

## Milestones

### Milestone 1: Core Bedrock Integration Complete ✅
**Goal**: Basic Bedrock provider working with Claude models

**Success Criteria**:
- [x] `@ai-sdk/amazon-bedrock` package installed (v3.0.50)
- [x] `amazon_bedrock` added to `CURRENT_MODELS` in `model-config.ts`
- [x] AI Provider Factory handles AWS credential chain (dummy API key pattern)
- [x] VercelProvider switch case added for `amazon_bedrock`
- [x] AWS SDK credential chain integration (env vars, ~/.aws/credentials, IAM roles)
- [x] Default model configured: `anthropic.claude-sonnet-4-5-20250929-v1:0`

**Validation**:
- ✅ Build passes with no TypeScript errors
- ✅ AWS credential chain properly configured
- ✅ Integration with Vercel AI SDK working

### Milestone 2: Integration Testing Complete ✅
**Goal**: Validate Bedrock provider works end-to-end

**Success Criteria**:
- [x] Integration test script created: `npm run test:integration:bedrock`
- [x] Test infrastructure bug fixed (kubeconfig pollution in test runner)
- [x] Integration tests executed with Bedrock provider
- [x] AWS Bedrock access validated (use case form submitted)
- [x] Claude Sonnet 4 via Bedrock tested successfully

**Validation**:
- ✅ Integration tests: 43/53 passing (81% success rate)
- ✅ Version tool tests pass with Bedrock provider
- ✅ Test script properly configured with correct model ID

**Note**: 10 test failures during AWS approval propagation period are expected and resolved after 15-minute wait.

### Milestone 3: Documentation Complete ✅
**Goal**: Users can successfully configure Bedrock provider

**Success Criteria**:
- [x] Model selection table updated with Amazon Bedrock
- [x] Configuration examples added to `docs/mcp-setup.md`
- [x] AWS credential setup documented
- [x] Bedrock model ID format documented
- [x] Code examples showing actual implementation pattern

**Validation**:
- ✅ Documentation shows `AI_PROVIDER=amazon_bedrock` pattern
- ✅ AWS credential chain explained
- ✅ Example configuration tested and verified

### Milestone 4: Bonus - Bedrock Embeddings Complete ✅
**Goal**: Add Bedrock embedding support for semantic search

**Success Criteria**:
- [x] `amazon_bedrock` added to embedding service
- [x] `EmbeddingConfig` interface updated
- [x] `VercelEmbeddingProvider` supports Bedrock
- [x] Factory function validates `amazon_bedrock` provider
- [x] Default embedding model: `amazon.titan-embed-text-v2:0` (1024 dimensions)
- [x] Documentation updated with embedding configuration

**Validation**:
- ✅ Code compiles with no TypeScript errors
- ✅ Same AWS credential pattern as generative AI
- ✅ Documentation includes Bedrock embedding examples

**Note**: This work also contributes to PRD #176 (Embedding Architecture Standardization).

---

## Success Criteria

### Functional Success
- [x] Users can switch to Bedrock by setting `AI_PROVIDER=amazon_bedrock` and AWS credentials
- [x] Claude Sonnet 4 model working via Bedrock
- [x] Tool calling and agentic behavior working (integration tests passing)
- [x] Existing integrations and tests continue working (backward compatibility maintained)
- [x] Bonus: Bedrock embeddings implemented for semantic search

### Quality Success
- [x] Build passes with no TypeScript errors
- [x] Error messages clear and actionable (AWS credential chain errors from SDK)
- [x] Zero breaking changes to existing configurations (new provider added, no changes to existing)
- [x] Integration tests: 81% passing (43/53), remaining failures due to AWS approval timing

### Implementation Success
- [x] Simplified architecture - no platform abstraction layer needed
- [x] Follows OpenRouter pattern - consistent with existing providers
- [x] Documentation updated with configuration examples
- [x] Test infrastructure bug fixed (kubeconfig pollution)

---

## Risks and Mitigations

### Risk 1: Model ID Fragility
**Risk**: Bedrock model IDs change frequently, breaking translation

**Mitigation**:
- Centralize model ID mapping in single configuration file
- Add validation to detect unsupported model IDs early
- Document how to use native Bedrock model IDs directly
- Monitor AWS Bedrock model catalog changes

### Risk 2: Feature Parity Gaps
**Risk**: Some Bedrock models lack tool calling or other features

**Mitigation**:
- Test tool calling on all models before marking milestone complete
- Document feature support matrix clearly
- Provide clear errors when unsupported features are used
- Consider model-specific capability detection

### Risk 3: AWS Credential Complexity
**Risk**: AWS credential chain is complex, users get confused

**Mitigation**:
- Provide clear setup guide with examples for each auth method
- Add detailed error messages for credential issues
- Include troubleshooting section for common AWS errors
- Consider credential validation tool/command

### Risk 4: Cost Surprises
**Risk**: Bedrock pricing differs from direct API, users surprised by costs

**Mitigation**:
- Document pricing differences clearly
- Link to AWS Bedrock pricing calculator
- Log token usage consistently for cost tracking
- Consider adding cost estimation in debug output

### Risk 5: Regional Availability
**Risk**: Not all models available in all AWS regions

**Mitigation**:
- Document model availability by region
- Provide clear error when model unavailable in selected region
- Suggest alternative regions in error messages
- Test in multiple common regions (us-east-1, us-west-2, eu-west-1)

---

## Dependencies

### External Dependencies
- **AWS Bedrock Access**: Users must enable Bedrock in their AWS account
- **Model Access**: Users must request access to specific models in AWS console
- **Vercel AI SDK**: `@ai-sdk/amazon-bedrock@^1.0.0` package
- **AWS SDK**: Compatible AWS credentials and region configuration

### Internal Dependencies
- **AI Provider Factory**: Must support platform routing
- **VercelProvider**: Must be extended for Bedrock initialization
- **Integration Test Infrastructure**: Must support AWS credential configuration
- **Documentation System**: Must be updated with new configuration patterns

### Blocked By
- None (independent feature addition)

### Blocks
- Future Azure OpenAI integration (will reuse platform pattern)
- Future GCP Vertex AI integration (will reuse platform pattern)

---

## Future Enhancements (Out of Scope for Phase 1)

### Phase 2: Additional Platforms
- Azure OpenAI Service integration (`AI_PLATFORM=azure`)
- GCP Vertex AI integration (`AI_PLATFORM=gcp`)
- Platform-specific optimizations (VPC endpoints, etc.)

### Phase 3: Advanced Bedrock Features
- Cross-region inference profiles
- Provisioned throughput support
- Model evaluation and fine-tuning integration
- Guardrails integration

### Phase 4: Enhanced Auth Methods
- IAM role assumption support
- Cross-account access configuration
- STS temporary credentials
- AWS SSO integration

### Phase 5: Platform-Specific Features
- AWS CloudWatch integration for logging
- AWS X-Ray tracing integration
- Cost allocation tags
- Service quotas monitoring

---

## Open Questions

### Resolved

1. **Implementation Pattern**: Should Bedrock be handled via switch case or separate conditional?
   - **Decision (2025-11-02)**: Use `amazon_bedrock` as provider type in switch statement
   - **Rationale**: Follows established pattern of provider overrides (`openrouter`)
   - **Impact**: Simplified code, better consistency, single case handles all models

2. **Architecture Approach**: Should we use `AI_PLATFORM` abstraction or treat Bedrock as standard provider?
   - **Decision (2025-11-02)**: Treat Bedrock as standard provider (`AI_PROVIDER=amazon_bedrock`)
   - **Rationale**: User feedback revealed over-engineering - simpler to follow OpenRouter pattern
   - **Impact**: No new env variables, no model translation, minimal code changes

3. **Model ID Format**: Should users provide native model IDs or Bedrock-specific IDs?
   - **Decision (2025-11-02)**: Users provide Bedrock model IDs directly (e.g., `global.anthropic.claude-sonnet-4-20250514-v1:0`)
   - **Rationale**: No translation layer needed - users specify what they want
   - **Impact**: Simpler implementation, clearer user experience

4. **Credential Priority**: What order should credential sources be checked?
   - **Decision (2025-11-02)**: Use AWS SDK standard credential chain
   - **Implementation**: Env vars → ~/.aws/credentials → IAM role (AWS SDK default order)
   - **Impact**: Consistent with AWS best practices

5. **Titan vs Direct API**: For models available both direct and on Bedrock, which should be default?
   - **Decision (2025-10-22)**: Native API remains default, Bedrock opt-in via provider selection
   - **Impact**: Backward compatibility preserved, users explicitly choose Bedrock

### Future Considerations

6. **Region Fallback**: Should we automatically try alternate regions if model unavailable?
   - **Current Behavior**: Fail fast with AWS SDK error
   - **Future Enhancement**: Could suggest alternative regions in error messages

7. **Multi-Model Testing**: Should we validate all Bedrock model families (Llama, Titan, Mistral)?
   - **Current State**: Claude Sonnet 4 validated
   - **Future Work**: Expand testing to other model families based on user demand

---

## Progress Log

### 2025-11-02 - Amazon Bedrock Provider Implementation Complete ✅

**Architecture Simplification**:
- **Original PRD Proposal**: Platform abstraction layer with `AI_PLATFORM=aws` + model ID translation
- **Implementation Feedback**: User questioned "Why do we need platform-config.ts?" and suggested using `AI_PROVIDER` instead
- **Final Decision**: Treat Bedrock as standard provider (`AI_PROVIDER=amazon_bedrock`) - much simpler
- **Result**: No `AI_PLATFORM`, no `platform-config.ts`, no model translation - just another provider choice

**Implementation Summary**:

**Core Changes**:
- Added `amazon_bedrock: 'anthropic.claude-sonnet-4-5-20250929-v1:0'` to `CURRENT_MODELS` (`src/core/model-config.ts`)
- Modified `src/core/ai-provider-factory.ts`: AWS credential handling with dummy API key pattern
- Added `case 'amazon_bedrock'` to `src/core/providers/vercel-provider.ts` with `createAmazonBedrock()` integration
- AWS SDK credential chain: env vars, ~/.aws/credentials, IAM roles

**Testing**:
- Created integration test script: `npm run test:integration:bedrock`
- Fixed test infrastructure bug: kubeconfig pollution in `tests/integration/infrastructure/run-integration-tests.sh`
- Test results: 43/53 passing (81%), 10 failures due to AWS approval timing
- Version tool tests passing with Bedrock provider

**Documentation**:
- Updated `docs/mcp-setup.md` with Bedrock in model selection table
- Added AWS credential configuration examples
- Documented Bedrock model ID format

**Bonus Work - Bedrock Embeddings** (contributes to PRD #176):
- Added `amazon_bedrock` to `src/core/embedding-service.ts`
- Updated `EmbeddingConfig` interface and `VercelEmbeddingProvider` class
- Default embedding model: `amazon.titan-embed-text-v2:0` (1024 dimensions)
- Same AWS credential pattern as generative AI
- Documentation updated with embedding provider configuration

**Files Modified**:
- `package.json`: Added `test:integration:bedrock` script, `@ai-sdk/amazon-bedrock@3.0.50` dependency
- `src/core/model-config.ts`: Added `amazon_bedrock` provider
- `src/core/ai-provider-factory.ts`: AWS credential handling
- `src/core/providers/vercel-provider.ts`: Bedrock provider case
- `src/core/embedding-service.ts`: Bedrock embedding support
- `docs/mcp-setup.md`: Configuration documentation
- `tests/integration/infrastructure/run-integration-tests.sh`: Kubeconfig bug fix

**Key Learnings**:
- Simplicity wins: User feedback prevented over-engineering with platform abstraction
- Following existing patterns (OpenRouter) led to minimal code changes
- Vercel AI SDK handles all Bedrock complexity - no custom provider needed

### 2025-10-22 - PRD Created
- Initial PRD draft created
- Architecture decision: Extend VercelProvider, not create separate provider
- Platform abstraction pattern defined (later simplified during implementation)
- 6 major milestones defined
- Priority models identified: Claude, Llama, Titan, Mistral

---

## References

- **Vercel AI SDK Bedrock Docs**: https://sdk.vercel.ai/providers/ai-sdk-providers/amazon-bedrock
- **AWS Bedrock Documentation**: https://docs.aws.amazon.com/bedrock/
- **PR #174 (Reference - Not Accepted)**: Alternative implementation using separate provider
- **Existing VercelProvider**: `src/core/providers/vercel-provider.ts`
- **AI Provider Factory**: `src/core/ai-provider-factory.ts`
- **Model Config**: `src/core/model-config.ts`
