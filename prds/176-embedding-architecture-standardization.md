# PRD #176: Standardize Embedding Architecture on Vercel AI SDK

**Status**: Draft
**Created**: 2025-10-22
**GitHub Issue**: [#176](https://github.com/vfarcic/dot-ai/issues/176)
**Priority**: Medium
**Related**: PRD #175 (Bedrock Provider Support)

---

## Problem Statement

The embedding service currently uses **two different architectural patterns** that create inconsistency, maintenance burden, and prevent future platform routing capabilities:

### Current Architecture Problems

1. **OpenAI Embeddings** (src/core/embedding-service.ts:8, 32-129):
   - Uses **native OpenAI SDK** (`import OpenAI from 'openai'`)
   - Direct API calls via `client.embeddings.create()`
   - Different error handling patterns
   - Different initialization logic

2. **Google & Mistral Embeddings** (src/core/embedding-service.ts:9-10, 135-332):
   - Use **Vercel AI SDK** (`import { embed } from 'ai'`)
   - Unified `embed()` API
   - Consistent error handling
   - Consistent initialization

### User Impact

This architectural inconsistency creates:

- **Maintenance Burden**: Two different patterns to maintain and test
- **Feature Gaps**: OpenAI embeddings can't leverage `AI_PLATFORM` routing (PRD #175)
- **Scalability Issues**: Adding Azure OpenAI embeddings would require yet another pattern
- **Code Duplication**: Similar functionality implemented differently
- **Developer Confusion**: Team members must remember which provider uses which pattern

### Missing Capability: Bedrock Embeddings

Users with AWS infrastructure cannot use Bedrock embedding models (Amazon Titan, Cohere) for semantic search, limiting adoption and preventing AWS-centric deployments.

## Solution Overview

Standardize all embedding providers on the **Vercel AI SDK** architecture and add **Bedrock embedding support**, creating a unified, scalable embedding system.

### Key Changes

1. **Migrate OpenAI to Vercel SDK**: Replace native SDK with `@ai-sdk/openai` embeddings
2. **Add Bedrock Support**: Implement BedrockEmbeddingProvider using `@ai-sdk/amazon-bedrock`
3. **Enable Platform Routing**: Support `AI_PLATFORM` for embeddings (same as PRD #175)
4. **Unified Pattern**: All providers use identical implementation pattern

### Architecture Benefits

- **Consistency**: All 4 providers (OpenAI, Google, Mistral, Bedrock) use identical pattern
- **Maintainability**: Single pattern to test, debug, and enhance
- **Scalability**: Easy to add Azure, GCP, or other embedding providers
- **Platform Routing**: Embeddings support multi-cloud deployment (PRD #175)
- **Reduced Dependencies**: Eliminate native `openai` SDK from embedding code

---

## User Stories

### Primary User Stories

1. **As a developer**, I want all embedding providers to use the same implementation pattern so I can maintain and extend the code easily
   - **Acceptance**: All embedding providers use Vercel AI SDK `embed()` function

2. **As an AWS user**, I want to use Amazon Titan embeddings for semantic search so I can leverage my AWS credits and infrastructure
   - **Acceptance**: Can set `EMBEDDINGS_PROVIDER=bedrock AI_PLATFORM=aws` to use Titan embeddings

3. **As a cost-conscious user**, I want access to Cohere embeddings via Bedrock so I can optimize embedding costs
   - **Acceptance**: Can use Cohere embedding models through Bedrock

4. **As a platform engineer**, I want embeddings to support platform routing so I can use OpenAI embeddings via Azure in the future
   - **Acceptance**: Embedding architecture supports `AI_PLATFORM` parameter

### Secondary User Stories

5. **As a developer**, I want consistent error messages across embedding providers so I can debug issues quickly
   - **Acceptance**: All providers throw errors with same format and information

6. **As a user**, I want my existing OpenAI embedding configurations to continue working after the migration
   - **Acceptance**: Zero breaking changes, backward compatibility maintained

---

## Technical Approach

### Architecture Decision: Unified Vercel SDK Pattern

**Decision**: Migrate OpenAI embeddings to Vercel AI SDK and extend pattern to Bedrock.

**Rationale**:
- 2 of 3 current providers already use Vercel SDK (Google, Mistral)
- Vercel SDK provides unified interface across all providers
- Enables platform routing for multi-cloud scenarios
- Reduces total dependency footprint
- Simplifies testing and maintenance

### Implementation Overview

#### 1. Migrate OpenAI Embeddings

**Current Implementation** (Native SDK):
```typescript
import OpenAI from 'openai';

this.client = new OpenAI({ apiKey });
const response = await this.client.embeddings.create({
  model: this.model,
  input: text.trim(),
  encoding_format: 'float'
});
return response.data[0].embedding;
```

**New Implementation** (Vercel SDK):
```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { embed } from 'ai';

const openai = createOpenAI({ apiKey: this.apiKey });
const model = openai.textEmbedding(this.model);
const result = await embed({ model, value: text.trim() });
return result.embedding;
```

**Impact**: Matches Google and Mistral patterns exactly.

#### 2. Add Bedrock Embedding Provider

**New Implementation**:
```typescript
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embed } from 'ai';

export class BedrockEmbeddingProvider implements EmbeddingProvider {
  async generateEmbedding(text: string): Promise<number[]> {
    const model = bedrock.textEmbedding(this.model);
    const result = await embed({ model, value: text.trim() });
    return result.embedding;
  }
}
```

**Supported Models**:
- `amazon.titan-embed-text-v1` (1536 dimensions)
- `amazon.titan-embed-text-v2:0` (1024 dimensions, configurable)
- `cohere.embed-english-v3` (1024 dimensions)
- `cohere.embed-multilingual-v3` (1024 dimensions)

#### 3. Platform Routing for Embeddings

**Configuration Pattern**:
```bash
# OpenAI via native API (current - unchanged)
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=sk-...

# OpenAI via Azure (future, enabled by this PRD)
EMBEDDINGS_PROVIDER=openai
AI_PLATFORM=azure
AZURE_OPENAI_API_KEY=...

# Bedrock embeddings via AWS (new)
EMBEDDINGS_PROVIDER=bedrock
AI_PLATFORM=aws
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

**Factory Enhancement** (src/core/embedding-service.ts:337-361):
```typescript
function createEmbeddingProvider(config: EmbeddingConfig = {}): EmbeddingProvider | null {
  const provider = config.provider || process.env.EMBEDDINGS_PROVIDER || 'openai';
  const platform = process.env.AI_PLATFORM || 'native';

  // Route based on platform
  if (platform === 'aws' && ['openai', 'anthropic', 'bedrock'].includes(provider)) {
    return createBedrockEmbeddingProvider(provider, config);
  }

  // Native provider routing
  switch (provider.toLowerCase()) {
    case 'bedrock':
      return new BedrockEmbeddingProvider(config);
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'google':
      return new GoogleEmbeddingProvider(config);
    case 'mistral':
      return new MistralEmbeddingProvider(config);
  }
}
```

#### 4. Unified Error Handling

All providers will use consistent error format:
```typescript
throw new Error(`${ProviderName} embedding failed: ${error.message}`);
```

---

## Supported Embedding Models

### Current Models (Maintaining Compatibility)

| Provider | Model | Dimensions | SDK |
|----------|-------|------------|-----|
| OpenAI | `text-embedding-3-small` | 1536 | Vercel (migrated) |
| Google | `text-embedding-004` | 768 | Vercel (current) |
| Mistral | `mistral-embed` | 1024 | Vercel (current) |

### New Models (Bedrock)

| Provider | Model | Dimensions | Notes |
|----------|-------|------------|-------|
| Bedrock | `amazon.titan-embed-text-v1` | 1536 | AWS native model |
| Bedrock | `amazon.titan-embed-text-v2:0` | 1024 | Configurable dimensions (1024/512/256) |
| Bedrock | `cohere.embed-english-v3` | 1024 | English-optimized |
| Bedrock | `cohere.embed-multilingual-v3` | 1024 | Multilingual support |

### Future Models (Enabled by Architecture)

- OpenAI via Azure OpenAI Service
- Google via GCP Vertex AI
- Anthropic via Bedrock (if embedding models added)

---

## Milestones

### Milestone 1: OpenAI Migration Complete ✅
**Goal**: OpenAI embeddings use Vercel AI SDK pattern

**Success Criteria**:
- [ ] OpenAIEmbeddingProvider refactored to use `@ai-sdk/openai`
- [ ] Native `openai` SDK dependency removed from embedding code
- [ ] All existing OpenAI embedding functionality working
- [ ] Error handling matches Google/Mistral pattern
- [ ] Backward compatibility verified (no breaking changes)

**Validation**:
- Unit tests pass for OpenAI embeddings
- Integration tests verify embedding generation
- Existing configurations work without modification
- Performance equivalent to native SDK

### Milestone 2: Unified Embedding Pattern Validated ✅
**Goal**: All 3 existing providers use identical pattern

**Success Criteria**:
- [ ] OpenAI, Google, and Mistral providers use same `embed()` API
- [ ] All providers implement EmbeddingProvider interface identically
- [ ] Error handling consistent across all providers
- [ ] Code structure matches for all provider classes
- [ ] Documentation updated to reflect unified pattern

**Validation**:
- Code review confirms identical structure
- All provider tests use same test patterns
- Documentation shows consistent usage examples
- Developer guide updated with unified pattern

### Milestone 3: Bedrock Embedding Provider Working ✅
**Goal**: Basic Bedrock embedding functionality operational

**Success Criteria**:
- [ ] `@ai-sdk/amazon-bedrock` package integrated
- [ ] BedrockEmbeddingProvider class implemented
- [ ] Amazon Titan Embed v1 and v2 models working
- [ ] Cohere embedding models working
- [ ] AWS credential authentication working
- [ ] Configuration via `EMBEDDINGS_PROVIDER=bedrock`

**Validation**:
- Integration test: Generate embedding with Titan v1
- Integration test: Generate embedding with Titan v2
- Integration test: Generate embedding with Cohere
- Integration test: Batch embedding generation
- AWS credential validation working

### Milestone 4: Platform Routing Implemented ✅
**Goal**: Embeddings support `AI_PLATFORM` parameter

**Success Criteria**:
- [ ] Factory routes embeddings based on `AI_PLATFORM`
- [ ] Platform configuration layer integrated
- [ ] AWS platform routing working for Bedrock
- [ ] Native platform routing maintained for direct APIs
- [ ] Future Azure/GCP routing prepared

**Validation**:
- Test: `AI_PLATFORM=aws EMBEDDINGS_PROVIDER=openai` routes to Bedrock
- Test: `AI_PLATFORM=native EMBEDDINGS_PROVIDER=openai` routes to OpenAI
- Test: Omitting `AI_PLATFORM` defaults to native
- Architecture supports future platforms

### Milestone 5: Integration Tests Complete ✅
**Goal**: Comprehensive test coverage for all providers

**Success Criteria**:
- [ ] Integration tests for all 4 embedding providers
- [ ] Tests for single and batch embedding generation
- [ ] Tests for platform routing logic
- [ ] Tests for error handling and edge cases
- [ ] Tests for credential validation
- [ ] Performance benchmarks for all providers

**Validation**:
- 100% of embedding providers covered by integration tests
- All tests passing consistently
- Performance within acceptable ranges
- Error conditions handled gracefully

### Milestone 6: Documentation Complete ✅
**Goal**: Users can successfully configure and use all embedding providers

**Success Criteria**:
- [ ] Embedding provider documentation updated
- [ ] Configuration examples for all 4 providers
- [ ] Platform routing documentation
- [ ] Migration guide for OpenAI users (if needed)
- [ ] Troubleshooting guide for Bedrock setup
- [ ] Architecture documentation updated

**Validation**:
- Documentation tested with fresh user
- All configuration examples working
- Troubleshooting guide covers common issues
- Architecture diagrams accurate

### Milestone 7: Production Ready ✅
**Goal**: Feature stable and launched

**Success Criteria**:
- [ ] All integration tests passing
- [ ] No breaking changes to existing configurations
- [ ] Performance benchmarks acceptable
- [ ] Error messages clear and actionable
- [ ] Feature announced in release notes
- [ ] Community feedback collected

**Validation**:
- Full test suite passes on CI/CD
- Backward compatibility verified
- Performance equivalent or better than before
- At least 3 users successfully using Bedrock embeddings

---

## Success Criteria

### Functional Success
- [ ] All 4 embedding providers use identical implementation pattern
- [ ] OpenAI embeddings work identically before and after migration
- [ ] Bedrock embeddings working for all supported models
- [ ] Platform routing enables future Azure/GCP support
- [ ] Zero breaking changes to existing configurations

### Quality Success
- [ ] Embedding quality equivalent to native SDKs
- [ ] Performance within 10% of native SDK implementations
- [ ] Error messages clear and consistent across providers
- [ ] Code coverage >80% for embedding service

### Architecture Success
- [ ] Single pattern eliminates maintenance burden
- [ ] Platform routing enables multi-cloud strategy
- [ ] Native `openai` SDK removed from embedding dependencies
- [ ] Future provider additions require minimal code

---

## Risks and Mitigations

### Risk 1: OpenAI Migration Breaks Existing Users
**Risk**: Refactoring OpenAI embeddings introduces bugs or behavior changes

**Mitigation**:
- Extensive integration testing before/after migration
- Feature flag for gradual rollout if needed
- Backward compatibility testing with existing configs
- Document any subtle behavior differences
- Support rollback plan if issues discovered

**Severity**: Medium
**Likelihood**: Low

### Risk 2: Vercel SDK Feature Gaps
**Risk**: Vercel SDK missing features available in native OpenAI SDK

**Mitigation**:
- Audit current OpenAI embedding usage for advanced features
- Test all code paths that use embeddings
- Verify Vercel SDK supports all needed functionality
- Keep native SDK as fallback option if gaps found

**Severity**: High
**Likelihood**: Very Low (Vercel SDK is mature)

### Risk 3: Performance Regression
**Risk**: Vercel SDK adds latency or reduces throughput

**Mitigation**:
- Benchmark before/after migration
- Profile embedding generation performance
- Test batch embedding performance
- Optimize if regressions found
- Document performance characteristics

**Severity**: Medium
**Likelihood**: Low

### Risk 4: AWS Credential Complexity
**Risk**: Users struggle with AWS authentication for Bedrock embeddings

**Mitigation**:
- Comprehensive setup documentation
- Clear error messages for credential issues
- Examples for common AWS credential patterns
- Troubleshooting guide for AWS-specific errors
- Test in multiple AWS regions

**Severity**: Medium
**Likelihood**: Medium

### Risk 5: Model Availability Variance
**Risk**: Bedrock embedding models not available in all AWS regions

**Mitigation**:
- Document model availability by region
- Provide clear error when model unavailable
- Suggest alternative regions in error messages
- Test in common AWS regions
- Link to AWS Bedrock model availability docs

**Severity**: Low
**Likelihood**: High

---

## Dependencies

### External Dependencies
- **Vercel AI SDK**: `@ai-sdk/openai` for OpenAI embeddings
- **Vercel AI SDK**: `@ai-sdk/amazon-bedrock` for Bedrock embeddings
- **AWS Credentials**: For Bedrock access
- **PRD #175**: Platform configuration layer (`AI_PLATFORM`)

### Internal Dependencies
- **Embedding Service**: Core refactoring required
- **Integration Tests**: Must be updated for new patterns
- **Documentation**: Multiple docs need updates

### Blocked By
- None (can implement independently, synergizes with PRD #175)

### Blocks
- Future Azure OpenAI embeddings (needs unified pattern)
- Future GCP Vertex AI embeddings (needs platform routing)

---

## Related Work

### PRD #175: Bedrock Provider Support
- Introduces `AI_PLATFORM` environment variable
- Implements platform configuration layer
- Enables multi-cloud provider routing
- **Synergy**: This PRD extends platform routing to embeddings

### Current Embedding Service
- **File**: `src/core/embedding-service.ts`
- **Current Providers**: OpenAI (native SDK), Google (Vercel), Mistral (Vercel)
- **Interface**: `EmbeddingProvider` with `generateEmbedding()` and `generateEmbeddings()`

---

## Open Questions

1. **Dependency Elimination**: Should we remove `openai` package entirely from dependencies?
   - **Proposal**: Yes, if only used for embeddings (check AI provider usage)
   - **Decision**: TBD during implementation

2. **Migration Strategy**: Gradual rollout or immediate switch for OpenAI embeddings?
   - **Proposal**: Immediate switch with comprehensive testing
   - **Decision**: TBD based on risk assessment

3. **Default Bedrock Model**: Which Bedrock model should be default?
   - **Proposal**: `amazon.titan-embed-text-v2:0` (AWS native, good dimensions)
   - **Decision**: TBD during implementation

4. **Titan v2 Dimensions**: What dimensions should we default to (1024/512/256)?
   - **Proposal**: 1024 (balance of quality and performance)
   - **Decision**: TBD during implementation

5. **Error Handling**: Should Bedrock credential errors be more prescriptive than other providers?
   - **Proposal**: Yes, AWS auth can be complex - provide detailed guidance
   - **Decision**: TBD during implementation

---

## Future Enhancements (Out of Scope)

### Phase 2: Additional Embedding Platforms
- Azure OpenAI embeddings via `AI_PLATFORM=azure`
- GCP Vertex AI embeddings via `AI_PLATFORM=gcp`
- Anthropic embeddings (if they launch embedding models)

### Phase 3: Advanced Embedding Features
- Embedding caching for frequently-used texts
- Batch optimization for large-scale operations
- Embedding dimension reduction/compression
- Custom embedding models (via Bedrock fine-tuning)

### Phase 4: Embedding Quality Improvements
- Hybrid search (keyword + semantic)
- Multi-vector embeddings
- Domain-specific embedding models
- Embedding quality benchmarking

---

## References

- **Vercel AI SDK Embeddings**: https://sdk.vercel.ai/docs/ai-sdk-core/embeddings
- **Vercel OpenAI Provider**: https://sdk.vercel.ai/providers/ai-sdk-providers/openai
- **Vercel Bedrock Provider**: https://sdk.vercel.ai/providers/ai-sdk-providers/amazon-bedrock
- **Current Embedding Service**: `src/core/embedding-service.ts`
- **PRD #175**: Bedrock Provider Support (platform routing)
- **PR #174**: Alternative Bedrock implementation (reference only)
