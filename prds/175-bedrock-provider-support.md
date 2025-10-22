# PRD #175: Add Amazon Bedrock Provider Support via AI_PLATFORM

**Status**: Draft
**Created**: 2025-10-22
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

Introduce an `AI_PLATFORM` environment variable that enables users to access AI models through different hosting platforms while maintaining the existing direct API support. Initially implements AWS Bedrock, with architecture designed to support Azure OpenAI, GCP Vertex AI, and other platforms in the future.

### Key Design Principles

1. **Platform-Provider Separation**: Separate "which model" (`AI_PROVIDER`) from "where it's hosted" (`AI_PLATFORM`)
2. **Backward Compatibility**: Default to `native` (direct API) when `AI_PLATFORM` is omitted
3. **Unified Interface**: Extend existing `VercelProvider` rather than creating separate provider classes
4. **Scalability**: Support any provider × platform combination without combinatorial explosion

### User Experience

```bash
# Current behavior (unchanged) - Direct Anthropic API
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-...

# New: Anthropic via AWS Bedrock
AI_PROVIDER=anthropic
AI_PLATFORM=aws
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# New: Llama via AWS Bedrock
AI_PROVIDER=llama
AI_PLATFORM=aws
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Future: OpenAI via Azure
AI_PROVIDER=openai
AI_PLATFORM=azure
AZURE_OPENAI_API_KEY=...
```

---

## User Stories

### Primary User Stories

1. **As an AWS enterprise customer**, I want to use Claude models through Bedrock so I can leverage my existing AWS credits and centralized billing
   - **Acceptance**: Can set `AI_PLATFORM=aws` and use AWS credentials to access Claude models

2. **As a DevOps engineer**, I want to use Llama 3 models through Bedrock so I can access open-source models without managing separate API keys
   - **Acceptance**: Can deploy with `AI_PROVIDER=llama AI_PLATFORM=aws` and access Llama models

3. **As a security-conscious organization**, I want all AI traffic to go through AWS so I can enforce VPC endpoints and AWS security controls
   - **Acceptance**: All model requests use AWS SDK with standard AWS security configurations

4. **As a cost-conscious user**, I want to use Amazon Titan models through Bedrock so I can optimize costs with AWS-native models
   - **Acceptance**: Can use Titan models via `AI_PROVIDER=titan AI_PLATFORM=aws`

### Secondary User Stories

5. **As a multi-cloud user**, I want consistent configuration patterns for accessing models across platforms
   - **Acceptance**: Same `AI_PLATFORM` pattern works for future Azure/GCP integrations

6. **As a developer**, I want automatic model ID translation so I don't need to remember Bedrock-specific model identifiers
   - **Acceptance**: System translates `claude-sonnet-4-5-20250929` to `anthropic.claude-3-5-sonnet-20241022-v2:0` automatically

---

## Technical Approach

### Architecture Decision: Extend VercelProvider

**Decision**: Add Bedrock support to existing `VercelProvider` using `@ai-sdk/amazon-bedrock` package.

**Rationale**:
- Vercel AI SDK already provides Bedrock integration
- Maintains consistency with existing multi-provider architecture
- Avoids duplicating tool loop, prompt caching, and agentic behavior logic
- Simplifies maintenance and testing

**Alternative Rejected**: Creating separate `BedrockProvider` (as in PR #174) would:
- Duplicate functionality already in Vercel SDK
- Break the unified provider pattern
- Require maintaining parallel implementations of tool calling, caching, etc.
- Create technical debt and inconsistency

### Implementation Components

#### 1. Platform Configuration Layer

**File**: `src/core/platform-config.ts` (new)

Manages platform-specific configuration and model ID translation:

```typescript
export type PlatformType = 'native' | 'aws' | 'azure' | 'gcp';
export type ProviderType = 'anthropic' | 'openai' | 'google' | 'llama' | 'titan' | ...;

export interface PlatformConfig {
  platform: PlatformType;
  provider: ProviderType;
  region?: string;
}

// Translate native model IDs to platform-specific IDs
export function translateModelId(
  nativeModelId: string,
  provider: ProviderType,
  platform: PlatformType
): string;
```

#### 2. Enhanced AI Provider Factory

**File**: `src/core/ai-provider-factory.ts` (modify)

Add platform detection and credential routing:

```typescript
static createFromEnv(): AIProvider {
  const providerType = process.env.AI_PROVIDER || 'anthropic';
  const platformType = process.env.AI_PLATFORM || 'native';

  // Route based on platform
  if (platformType === 'aws') {
    return this.createBedrockProvider(providerType);
  }

  // Existing native provider logic
  return this.createNativeProvider(providerType);
}
```

#### 3. Extended Vercel Provider

**File**: `src/core/providers/vercel-provider.ts` (modify)

Add Bedrock initialization in the provider switch:

```typescript
private initializeModel(): void {
  const platform = process.env.AI_PLATFORM || 'native';

  if (platform === 'aws') {
    return this.initializeBedrockModel();
  }

  // Existing provider initialization
  switch (this.providerType) {
    case 'anthropic':
      provider = createAnthropic({ apiKey: this.apiKey });
      break;
    // ... rest of existing providers
  }
}

private async initializeBedrockModel(): void {
  const { bedrock } = await import('@ai-sdk/amazon-bedrock');

  const translatedModelId = translateModelId(
    this.model,
    this.providerType,
    'aws'
  );

  this.modelInstance = bedrock(translatedModelId);
}
```

#### 4. Model ID Translation

**Mapping Strategy**:

| Provider | Native Model ID | Bedrock Model ID |
|----------|----------------|------------------|
| Anthropic Claude Sonnet 4 | `claude-sonnet-4-5-20250929` | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| Anthropic Claude Haiku | `claude-haiku-4-5-20251001` | `anthropic.claude-3-5-haiku-20241022-v1:0` |
| Meta Llama 3 70B | `llama-3-70b-instruct` | `meta.llama3-70b-instruct-v1:0` |
| Amazon Titan Text | `titan-text-premier` | `amazon.titan-text-premier-v1:0` |
| Mistral Large | `mistral-large-latest` | `mistral.mistral-large-2407-v1:0` |

**Implementation**: Maintain mapping table that's easy to update as models evolve.

#### 5. Credential Management

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

### Milestone 1: Platform Infrastructure Complete ✅
**Goal**: Core platform abstraction layer working

**Success Criteria**:
- [ ] `AI_PLATFORM` environment variable recognized and validated
- [ ] Platform configuration layer (`platform-config.ts`) implemented
- [ ] Model ID translation working for Anthropic and Llama models
- [ ] Credential detection and validation working for AWS
- [ ] Backward compatibility verified (omitting `AI_PLATFORM` works as before)

**Validation**:
- Unit tests for platform detection
- Unit tests for model ID translation
- Integration test with `AI_PLATFORM=native` behaves identically to current behavior

### Milestone 2: Bedrock Provider Integration Working ✅
**Goal**: Basic Bedrock connectivity through VercelProvider

**Success Criteria**:
- [ ] `@ai-sdk/amazon-bedrock` package installed and integrated
- [ ] VercelProvider extended to support Bedrock initialization
- [ ] AI Provider Factory routes to Bedrock when `AI_PLATFORM=aws`
- [ ] Basic text generation working with Claude Sonnet on Bedrock
- [ ] Error handling and validation for AWS credentials

**Validation**:
- Integration test: Send prompt to Claude via Bedrock, receive response
- Integration test: Invalid AWS credentials produce clear error message
- Integration test: Missing `AWS_REGION` produces clear error message

### Milestone 3: Multi-Model Support Validated ✅
**Goal**: All priority models (Claude, Llama, Titan, Mistral) working via Bedrock

**Success Criteria**:
- [ ] Claude Sonnet 4 and Haiku 4 working via Bedrock
- [ ] Llama 3 70B working via Bedrock
- [ ] Amazon Titan Text Premier working via Bedrock
- [ ] Mistral Large working via Bedrock
- [ ] Model ID translation working for all supported models
- [ ] Token usage tracking accurate across all models

**Validation**:
- Integration test suite covering all 4 model families
- Comparative test: Same prompt to Claude via native API vs Bedrock produces equivalent quality
- Performance test: Latency acceptable compared to native API

### Milestone 4: Tool Calling and Agentic Behavior Working ✅
**Goal**: Full feature parity for Bedrock providers

**Success Criteria**:
- [ ] Tool calling working for Claude models on Bedrock
- [ ] Tool calling working for Llama models on Bedrock
- [ ] Agentic tool loops working (multi-turn conversations)
- [ ] Token tracking includes tool call tokens
- [ ] Existing integration tests pass with `AI_PLATFORM=aws`

**Validation**:
- Run existing remediation integration tests with `AI_PLATFORM=aws AI_PROVIDER=anthropic`
- Run existing capability discovery tests with Bedrock providers
- Verify agentic behavior quality matches native API

### Milestone 5: Documentation Complete and Tested ✅
**Goal**: Users can successfully set up and use Bedrock providers

**Success Criteria**:
- [ ] Environment variable documentation updated with `AI_PLATFORM` examples
- [ ] AWS credential setup guide written
- [ ] Model availability and pricing documented
- [ ] Troubleshooting guide for common AWS/Bedrock errors
- [ ] Architecture documentation updated with platform abstraction layer
- [ ] All code examples tested and working

**Validation**:
- Fresh user can follow docs to set up Bedrock provider in <15 minutes
- Docs validation test suite passes (test all examples in docs)
- No broken links or outdated information

### Milestone 6: Production-Ready and Launched ✅
**Goal**: Feature stable, tested, and available to all users

**Success Criteria**:
- [ ] All integration tests passing consistently
- [ ] Performance benchmarks acceptable (within 20% of native API latency)
- [ ] Error messages clear and actionable
- [ ] Logging and debugging support adequate
- [ ] Feature announced in release notes
- [ ] Community feedback collected and addressed

**Validation**:
- Full test suite passes on CI/CD
- No P0/P1 bugs in issue tracker
- At least 3 community users successfully using Bedrock providers
- Performance metrics within acceptable ranges

---

## Success Criteria

### Functional Success
- [ ] Users can switch from native to Bedrock by changing 3 env vars
- [ ] All supported models work equivalently to native API
- [ ] Tool calling and agentic behavior fully functional
- [ ] Existing integrations and tests continue working

### Quality Success
- [ ] Response quality equivalent to native API (comparative evaluation)
- [ ] Latency within 20% of native API
- [ ] Error messages clear and actionable
- [ ] Zero breaking changes to existing configurations

### Adoption Success
- [ ] At least 10% of active users try Bedrock integration within 30 days
- [ ] At least 3 GitHub issues/discussions showing successful usage
- [ ] Positive community feedback on feature value

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

1. **Model ID Override**: Should we allow users to specify Bedrock-specific model IDs directly to bypass translation?
   - **Proposal**: Support both translated IDs and native Bedrock IDs
   - **Decision**: TBD during implementation

2. **Region Fallback**: Should we automatically try alternate regions if model unavailable?
   - **Proposal**: Fail fast with clear error, suggest regions in error message
   - **Decision**: TBD during implementation

3. **Credential Priority**: What order should credential sources be checked?
   - **Proposal**: Env vars → credentials file → IAM role (standard AWS SDK order)
   - **Decision**: TBD during implementation

4. **Titan vs Direct API**: For models available both direct and on Bedrock, which should be default?
   - **Proposal**: Native API remains default, Bedrock opt-in via `AI_PLATFORM`
   - **Decision**: Confirmed

---

## Progress Log

### 2025-10-22 - PRD Created
- Initial PRD draft created
- Architecture decision: Extend VercelProvider, not create separate provider
- Platform abstraction pattern defined: `AI_PLATFORM` environment variable
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
