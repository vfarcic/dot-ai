# DevOps AI Toolkit Project - Claude Code Integration Guide

## ⚠️ MANDATORY TASK COMPLETION CHECKLIST ⚠️

**🔴 BEFORE MARKING ANY TASK/SUBTASK AS COMPLETE:**

□ **Tests Written**: Write tests for new functionality (can be after implementation)
□ **All Tests Pass**: Run `npm test` - ALL tests must pass  
□ **No Test Failures**: Fix any failing tests before proceeding
□ **CLAUDE.md Updated**: Update this file if new features/commands/structure added

**❌ TASK IS NOT COMPLETE IF:**
- Any tests are failing
- New code lacks test coverage  
- You haven't run `npm test` to verify

## PERMANENT INSTRUCTIONS

**CRITICAL DEVELOPMENT RULES - NEVER OVERRIDE:**

1. **Always Write Tests**: When making code changes, you MUST write or update tests to validate the changes
2. **Always Run All Tests**: Before marking any task as complete, run `npm test` to ensure all tests pass  
3. **Never Claim Done with Failing Tests**: A task is NOT complete if any tests are failing - fix all test failures first
4. **Test-Driven Validation**: Changes are only considered successful when validated by passing tests
5. **Always Check for Reusability**: Before implementing new functionality, ALWAYS search the codebase for existing similar functions or utilities that can be reused or extended. Never duplicate code - create shared utilities instead.
6. **CLAUDE.md Updates**: Only update CLAUDE.md for fundamental changes to development workflow, new architectural patterns, or structural changes that future developers need to know. Do NOT add recent updates, change logs, or temporary information - use git commits and PR descriptions for those.

## 🛑 TESTING REMINDERS

- **Current test suite**: Comprehensive test coverage across 21 suites - maintain this standard
- **Implementation flow**: Code → Tests → `npm test` → Mark complete
- **Pattern matching**: Look at `tests/schema.test.ts`, `tests/cli.test.ts` for testing patterns
- **Test organization**: Mirror source code structure - tests should be organized using the same naming convention as the code they're testing
  - `src/core/schema.ts` → `tests/core/schema.test.ts`
  - `src/interfaces/cli.ts` → `tests/interfaces/cli.test.ts`
  - `src/mcp/server.ts` → `tests/mcp/server.test.ts`
  - Keep integration tests separate in `tests/integration/`

## Project Overview

**DevOps AI Toolkit** is an intelligent Kubernetes application deployment agent that discovers cluster capabilities and provides AI-powered recommendations for deploying applications using available resources.

### Core Features
- **Cluster Discovery**: Automatically discovers Kubernetes resources and custom operators
- **AI Recommendations**: Get intelligent deployment recommendations based on your intent
- **Solution Enhancement**: Process open-ended user requirements to enhance configurations
- **Operator Integration**: Leverages custom operators like Crossplane, ArgoCD when available

### Key Commands

```bash
# Core dot-ai commands
dot-ai discover                           # Discover cluster resources
dot-ai recommend --intent "description"   # Get AI-powered recommendations  
dot-ai enhance --solution solution.json   # Enhance solutions with user requirements
dot-ai explain Pod                        # Get detailed resource schema
dot-ai fingerprint                        # Analyze cluster capabilities

# Development commands
npm test                                            # Run all tests
npm run build                                       # Build the project
npm run mcp:start                                   # Start MCP server
```

## AI Prompt Management 🤖

**CRITICAL DEVELOPMENT RULE: NEVER hard-code AI prompts in source code**

All AI prompts are stored as markdown files in the `prompts/` directory and loaded dynamically:

### Prompt File Structure
```
prompts/
├── intent-validation.md        # Validates user intent specificity
├── resource-selection.md       # AI resource candidate selection
├── resource-solution-ranking.md # AI resource ranking/scoring
├── question-generation.md      # Generate configuration questions
├── solution-enhancement.md     # Enhance solutions with requirements
├── resource-analysis.md        # Analyze resource capabilities
└── tool-instructions/          # Agent instructions for tools
    ├── recommend.md           # User interaction requirements
    ├── enhance-solution.md    # Enhancement tool instructions
    └── recommendation-workflow.md # Workflow instructions
```

### Loading Pattern (ALWAYS USE THIS)
```typescript
// Load prompt template from file
const fs = await import('fs');
const path = await import('path');

const promptPath = path.join(process.cwd(), 'prompts', 'your-prompt.md');
const template = fs.readFileSync(promptPath, 'utf8');

// Replace template variables
const finalPrompt = template
  .replace('{variable1}', value1)
  .replace('{variable2}', value2);

// Send to AI
const response = await claudeIntegration.sendMessage(finalPrompt);
```

### Template Variables
- Use `{variableName}` format in markdown files
- Replace with `.replace('{variableName}', actualValue)`
- Keep prompts readable and maintainable

### Why File-Based Prompts?
- **Version control**: Track prompt changes in git
- **Collaboration**: Non-technical team members can edit prompts  
- **Testing**: Easy to test different prompt variations
- **Maintainability**: Separate concerns (logic vs. prompts)
- **Consistency**: Standardized approach across all AI features

### Adding New AI Features
1. **Create prompt file**: `prompts/your-feature.md`
2. **Use template variables**: `{intent}`, `{context}`, etc.
3. **Load in code**: Follow the standard loading pattern above
4. **Never hardcode**: Always load from file system

### Project Structure

```
src/
├── core/
│   ├── discovery.ts      # Cluster discovery engine
│   ├── schema.ts         # Resource schema parsing & AI recommendations
│   ├── claude.ts         # Claude AI integration
│   └── ...
├── interfaces/
│   ├── cli.ts           # CLI interface
│   └── mcp.ts           # MCP server interface
└── ...

docs/                    # All documentation
tests/                   # Comprehensive test suite (349+ tests)
prompts/                 # AI prompt templates
```

### Testing & Development

**MANDATORY TESTING WORKFLOW:**
- **Always write tests** for code changes before considering work complete
- **Always run all tests** with `npm test` before marking tasks as done
- **Never mark task complete** if any tests are failing
- **Always check CLAUDE.md** after task completion for needed updates

**Commands:**
- **Run tests**: `npm test` (462+ tests across 19 suites)
- **Build**: `npm run build`
- **Manual testing**: Follow examples in CLI and MCP guides
- **Documentation**: See `docs/` directory for complete guides

### Environment Setup

```bash
# Required for AI features
export ANTHROPIC_API_KEY=your_api_key_here

# Optional: Custom kubeconfig
export KUBECONFIG=/path/to/kubeconfig.yaml
```