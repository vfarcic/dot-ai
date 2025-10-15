# PRD: Guided Setup System for DevOps AI Toolkit

**Created**: 2025-10-15
**Status**: Planning - Ready to Start
**Owner**: Viktor Farcic  
**Last Updated**: 2025-10-15
**GitHub Issue**: [#165](https://github.com/vfarcic/dot-ai/issues/165)
**Priority**: High
**Complexity**: Medium

---

## Executive Summary

Create an interactive guided setup system that transforms the complex DevOps AI Toolkit configuration process into a simple question-based workflow. Users answer 4-5 questions about their needs and preferences, and the system generates all required configuration files (.env, .mcp.json, docker-compose.yml, setup instructions) with personalized recommendations.

**Current Pain**: 9 AI models × 3 embedding providers × 5 deployment methods = overwhelming complexity requiring extensive documentation reading
**Solution**: 5-minute guided setup with smart recommendations and automatic file generation

**Impact**: Reduce time-to-first-success from 30+ minutes to under 5 minutes, eliminate configuration errors, improve user onboarding experience.

---

## Problem Statement

### Current Setup Complexity

**1. Overwhelming Configuration Options**
- **27 AI combinations**: 9 AI models × 3 embedding providers  
- **5 deployment methods**: Docker, Kubernetes, ToolHive, NPX, Development
- **Multiple configuration files**: .env, .mcp.json, docker-compose.yml, kubeconfig
- **Scattered documentation**: 7+ setup guides across different methods

**2. High Cognitive Load** 
- Users must understand AI model trade-offs (quality vs cost vs speed)
- Need to learn embedding provider differences and cost implications
- Must choose deployment method without understanding trade-offs
- Complex environment variable dependencies and API key management

**3. Common Setup Failures**
- Wrong AI model for user's primary use case (e.g., choosing GPT-5 Pro which has reliability issues)
- Mismatched provider configurations (wrong API keys, incompatible setups)
- Deployment method doesn't match user's environment or skill level
- Missing or incorrect environment variables causing runtime failures

**4. Documentation Fatigue**
- Users abandon setup after reading extensive configuration options
- Information overload prevents decision-making
- Setup guides assume technical knowledge users may not have

### Impact on User Adoption

**Friction Points**:
- 30+ minutes average setup time with high failure rate
- Users confused about which AI model to choose for their needs
- Common misconfiguration leading to non-functional deployments
- Documentation requires deep reading to understand trade-offs

**Abandonment Scenarios**:
- Users overwhelmed by choices in setup documentation
- Configuration failures leading to "it doesn't work" perception
- Unclear cost implications causing budget concerns
- Complex setup process doesn't match "quick start" expectations

---

## Solution Overview

### Interactive Guided Setup System

**Core Concept**: Transform configuration complexity into a simple conversation
- **4-5 simple questions** instead of reading 7+ setup guides
- **Smart recommendations** based on proven usage patterns and performance data
- **Automatic file generation** with validated configurations
- **Personalized cost estimates** and setup instructions

### Question-Based Configuration Flow

**Step 1: Use Case Discovery**
```
🎯 What do you want to use the DevOps AI Toolkit for?
□ Kubernetes deployment recommendations  
□ Troubleshooting and debugging (remediation)
□ Documentation testing and validation
□ Shared prompts library only
□ Everything (full platform capabilities)
```

**Step 2: Environment Assessment**
```
🏗️ What's your preferred setup method?
□ Docker (recommended - works everywhere)
□ Kubernetes (I have a K8s cluster) 
□ NPX (I prefer Node.js tools)
□ Development (I want to contribute code)
```

**Step 3: AI Model Preferences**
```
💰 What's most important to you?
□ Best quality (cost is not a concern)
□ Best value (balance cost and performance)
□ Lowest cost (budget-conscious)
□ I have specific API credits to use

🤖 Any AI provider preferences?
□ No preference (show me the best option)
□ I prefer Anthropic (Claude)
□ I prefer OpenAI (GPT)  
□ I prefer Google (Gemini)
□ I want to try xAI (Grok)
```

### Smart Recommendation Engine

**Based on Performance Data**: Use real evaluation results from PRD-151
- Quality leaders: Claude Sonnet 4.5, Grok-4-Fast-Reasoning
- Value leaders: Grok-4-Fast-Reasoning, Gemini 2.5 Flash  
- Budget options: Google models, Mistral Large
- Avoid recommendations: GPT-5 Pro, Mistral Large (reliability issues)

**Personalized Configuration Example**:
```
📊 Your Recommended Configuration:

For your needs (Full platform, Best value, No preference):
✅ AI Model: Grok-4-Fast-Reasoning 
   → Excellent performance (0.765 score), cost-effective ($0.20/$0.50 per million tokens)
✅ Embedding: Google text-embedding-004
   → 5x cheaper than OpenAI, good semantic search performance
✅ Deployment: Docker  
   → All features working, no manual dependencies

💡 Why this setup?
• Grok-4-Fast-Reasoning: Best value in our testing, reliable across all tools
• Google embeddings: Significant cost savings without performance loss
• Docker: Proven setup that works in all environments

💸 Estimated monthly cost: $2-8 for typical usage
```

### Automatic File Generation

**Generated Configuration Files**:
1. **`.env`** - Environment variables with correct API key names
2. **`.mcp.json`** - MCP client configuration for chosen deployment method  
3. **`docker-compose.yml`** - If Docker deployment selected
4. **`setup-instructions.md`** - Personalized next steps
5. **`cost-estimate.md`** - Detailed cost breakdown for chosen configuration

---

## User Journey

### Before (Current State)
```
1. User discovers DevOps AI Toolkit, wants to try it
2. Clicks "Quick Start" → sees 7 different setup methods
3. Reads extensive documentation trying to understand choices
4. Gets overwhelmed by AI model options (9 models × trade-offs)
5. Guesses at configuration, creates .env and .mcp.json manually
6. Setup fails due to wrong API keys or configuration errors
7. Spends 30+ minutes troubleshooting or gives up
```

### After (With Guided Setup)
```
1. User discovers DevOps AI Toolkit, wants to try it
2. Runs guided setup: "npx @vfarcic/dot-ai setup" 
3. Answers 4-5 simple questions (2 minutes)
4. Reviews personalized recommendation with cost estimate
5. Confirms setup → all files generated automatically
6. Follows generated setup instructions (3 minutes)
7. Successfully using the toolkit within 5 minutes total
```

### Success Flow Example
```
$ npx @vfarcic/dot-ai setup

🚀 DevOps AI Toolkit - Guided Setup

Let's get you up and running in under 5 minutes!

🎯 What do you want to use the toolkit for?
[1] Kubernetes deployments  [2] Troubleshooting  [3] Everything
> 3

🏗️ Preferred setup method?  
[1] Docker (recommended)  [2] Kubernetes  [3] NPX
> 1

💰 What matters most?
[1] Best quality  [2] Best value  [3] Lowest cost
> 2

📊 Perfect! Here's your recommended setup:

AI Model: Grok-4-Fast-Reasoning (best value, 0.765 quality score)
Embedding: Google text-embedding-004 (cost-effective)
Deployment: Docker (all features included)

Estimated cost: $2-8/month for typical usage

✅ Generate configuration files? (y/n) y

Generated files:
• .env (with your API key placeholders)
• .mcp.json (Docker configuration)  
• docker-compose.yml (ready to run)
• setup-instructions.md (your next steps)

🎉 Setup complete! Follow setup-instructions.md to finish.
```

---

## Technical Approach

### Implementation Architecture

**CLI Tool Structure**:
```
src/
├── setup/
│   ├── guided-setup.ts        # Main setup orchestrator
│   ├── question-flow.ts       # Interactive questionnaire
│   ├── recommendation-engine.ts # AI model recommendations  
│   ├── file-generators/       # Configuration file generators
│   │   ├── env-generator.ts
│   │   ├── mcp-generator.ts
│   │   └── docker-generator.ts
│   └── validators/            # API key and setup validation
└── cli/
    └── setup-command.ts       # CLI entry point
```

**Decision Tree Logic**:
```typescript
interface SetupAnswers {
  useCase: 'deployment' | 'troubleshooting' | 'docs' | 'prompts' | 'full';
  deployment: 'docker' | 'kubernetes' | 'npx' | 'development';  
  priority: 'quality' | 'value' | 'cost';
  provider?: 'anthropic' | 'openai' | 'google' | 'xai' | 'none';
}

interface RecommendedConfig {
  aiModel: string;
  aiProvider: string;
  embeddingModel: string; 
  embeddingProvider: string;
  deployment: string;
  rationale: string;
  estimatedCost: string;
}
```

**Recommendation Engine**: 
- Use performance data from PRD-151 AI model comparison
- Apply cost-benefit analysis based on user priorities
- Factor in reliability scores and failure modes
- Consider provider-specific strengths for different use cases

### File Generation System

**Template-Based Generation**:
```typescript
// .env template
const envTemplate = `
# AI Model Configuration
AI_PROVIDER={{aiProvider}}
{{aiApiKey}}={{apiKeyPlaceholder}}

# Embedding Provider Configuration  
EMBEDDINGS_PROVIDER={{embeddingProvider}}
{{embeddingApiKey}}={{embeddingKeyPlaceholder}}

# Session Configuration
DOT_AI_SESSION_DIR=./tmp/sessions

# Generated by DevOps AI Toolkit Guided Setup on {{timestamp}}
`;
```

**Dynamic MCP Configuration**:
- Generate .mcp.json based on deployment method chosen
- Include correct command and arguments for selected setup
- Add environment variables specific to configuration

**Setup Instructions Generator**:
- Personalized next steps based on deployment method
- API key acquisition instructions for chosen providers
- Validation commands to test the setup
- Troubleshooting section for common issues

### Validation and Error Handling

**API Key Validation**:
- Optional API key testing during setup
- Provide clear instructions for obtaining API keys
- Validate API key format and basic connectivity

**Configuration Validation**:
- Ensure generated files are syntactically correct
- Validate environment variable names and values
- Check for common configuration conflicts

**Error Recovery**:
- Allow users to re-run setup to change configurations
- Preserve working configurations when updating
- Clear error messages with specific resolution steps

---

## Success Criteria

### User Experience Metrics
- [ ] Setup time reduced from 30+ minutes to under 5 minutes
- [ ] Setup success rate improved to >95% (vs current ~70%)
- [ ] User satisfaction: >90% rate setup as "easy" or "very easy"  
- [ ] Configuration errors reduced by >80%

### Feature Completeness
- [ ] Interactive CLI tool supporting all major setup scenarios
- [ ] Smart recommendations based on actual AI model performance data
- [ ] Automatic generation of all required configuration files
- [ ] Personalized cost estimates and setup instructions
- [ ] Comprehensive error handling and validation

### Integration Success  
- [ ] Generated configurations work with all existing deployment methods
- [ ] Backward compatibility with manual setup approaches
- [ ] Integration with existing documentation and setup guides
- [ ] Support for all current AI model and embedding provider combinations

### Adoption Metrics
- [ ] 50%+ of new users use guided setup within 30 days of launch
- [ ] Reduced support tickets related to setup and configuration issues
- [ ] Improved user retention in first week after setup
- [ ] Positive feedback from user community on setup experience

---

## Milestones

### Milestone 1: Core Question Flow & Recommendation Engine
**Goal**: Interactive questionnaire with smart AI model recommendations

**Tasks**:
- [ ] Design and implement interactive question flow system
- [ ] Create recommendation engine using PRD-151 performance data
- [ ] Implement decision tree logic for AI model selection
- [ ] Add cost estimation system based on user priorities
- [ ] Build rationale generator explaining recommendations

**Success Criteria**: Users can answer questions and receive personalized AI model recommendations with cost estimates

### Milestone 2: Configuration File Generation System
**Goal**: Automatic generation of all required setup files

**Tasks**:
- [ ] Implement .env file generator with correct API key variables
- [ ] Create .mcp.json generator for all deployment methods
- [ ] Add docker-compose.yml generation for Docker deployments
- [ ] Build personalized setup instructions generator
- [ ] Create cost breakdown and estimation reporting

**Success Criteria**: System generates syntactically correct configuration files for all deployment scenarios

### Milestone 3: CLI Tool Integration & Validation
**Goal**: Complete CLI tool with validation and error handling

**Tasks**:
- [ ] Build CLI command interface (`npx @vfarcic/dot-ai setup`)
- [ ] Implement API key format validation and testing
- [ ] Add configuration file validation and conflict detection
- [ ] Create setup verification and testing system
- [ ] Build error recovery and re-configuration support

**Success Criteria**: Full CLI tool working with comprehensive validation and error handling

### Milestone 4: Documentation Integration & User Testing
**Goal**: Complete documentation and validated user experience

**Tasks**:
- [ ] Update all setup guides to reference guided setup as primary method
- [ ] Create comprehensive guided setup documentation
- [ ] Add troubleshooting guide for common guided setup issues
- [ ] Conduct user testing with 10+ new users
- [ ] Iterate based on user feedback and usage patterns

**Success Criteria**: Documentation complete, user testing shows >90% success rate and positive feedback

### Milestone 5: Launch Optimization & Monitoring
**Goal**: Production-ready guided setup with monitoring and analytics

**Tasks**:
- [ ] Add usage analytics and success rate monitoring
- [ ] Implement guided setup performance optimization
- [ ] Create support documentation for troubleshooting guided setup issues
- [ ] Launch guided setup as default setup method
- [ ] Monitor adoption rates and user feedback

**Success Criteria**: Guided setup launched successfully with >50% adoption rate and <5% support ticket rate

---

## Dependencies

### Internal Dependencies
- [ ] AI model performance data from PRD-151 (available)
- [ ] Existing deployment method configurations (available)
- [ ] Current documentation and setup guides (available)
- [ ] MCP client configuration patterns (available)

### External Dependencies
- [ ] Node.js CLI framework (inquirer.js or similar)
- [ ] Template engine for file generation (handlebars or similar)
- [ ] API key validation libraries for different providers
- [ ] Cost calculation data from AI provider pricing pages

### Technical Requirements
- [ ] Node.js >=18 for CLI tool compatibility
- [ ] NPX support for easy installation and execution
- [ ] Cross-platform compatibility (Windows, macOS, Linux)
- [ ] Integration with existing package.json and npm scripts

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Generated configurations don't work in all environments | High | Comprehensive testing across all deployment methods, validation system |
| AI model recommendations become outdated | Medium | Update recommendation engine when new models added, version configurations |
| Users still prefer manual setup | Medium | Keep manual setup as option, gather feedback on why users avoid guided setup |
| CLI tool has compatibility issues | Medium | Test across Node.js versions and operating systems, provide fallback options |
| API key validation fails for some providers | Low | Make validation optional, provide clear manual verification steps |
| Cost estimates become inaccurate | Low | Regular updates from provider pricing, conservative estimates with warnings |

---

## Open Questions

1. **CLI vs Web Interface**: Should we also provide a web-based setup wizard in addition to CLI?
2. **Configuration Updates**: How should users update their configuration when new AI models are added?
3. **Team Setup**: Should guided setup support team/organization-wide configurations?
4. **Advanced Options**: How do we balance simplicity with power-user customization needs?
5. **Multi-Environment**: Should guided setup support different configs for dev/staging/prod?

---

## Out of Scope

### Deferred to Future Versions
- [ ] Web-based setup wizard interface  
- [ ] Advanced configuration customization options
- [ ] Team/organization setup workflows
- [ ] Integration with external configuration management tools

### Explicitly Not Included
- Automatic AI model switching based on task type
- Real-time cost monitoring and alerts  
- Setup configurations for non-MCP clients
- Custom AI model endpoint configurations

---

## Success Metrics

### Quantitative Goals
- **Setup Time**: Reduce average setup time from 30+ minutes to <5 minutes
- **Success Rate**: Increase first-time setup success from ~70% to >95%
- **Error Reduction**: Reduce configuration-related support tickets by >80%
- **Adoption**: 50%+ of new users adopt guided setup within 30 days

### Qualitative Goals  
- Users rate setup experience as significantly improved
- Reduced complexity and cognitive load during onboarding
- Increased confidence in AI model selection decisions
- Faster time-to-value for new DevOps AI Toolkit users

---

## Work Log

### 2025-10-15: PRD Creation
**Duration**: Initial planning session
**Status**: Draft

**Context**: 
Setup complexity has grown significantly with 9 AI models, 3 embedding providers, and 5 deployment methods. Current documentation requires extensive reading and manual configuration, leading to setup failures and user abandonment.

**Key Insight**: 
Transform the configuration problem into a conversation. Instead of asking users to understand 27 possible combinations, ask them about their goals and generate the optimal configuration automatically.

**Success Pattern Identified**:
Similar tools like create-react-app, Vue CLI, and Angular CLI use guided setup to eliminate configuration complexity. The DevOps AI Toolkit can follow this proven pattern.

**Next Steps**: Begin Milestone 1 - Core question flow and recommendation engine development