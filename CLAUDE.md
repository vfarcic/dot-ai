# DevOps AI Toolkit Project - Claude Code Integration Guide

## ⚠️ MANDATORY TASK COMPLETION CHECKLIST ⚠️

**🔴 BEFORE MARKING ANY TASK/SUBTASK AS COMPLETE:**

□ **Integration Tests Written**: Write integration tests for new functionality
□ **All Tests Pass**: Run `npm run test:integration` - ALL tests must pass
□ **No Test Failures**: Fix any failing tests before proceeding
□ **CLAUDE.md Updated**: Update this file if new features/commands/structure added

**❌ TASK IS NOT COMPLETE IF:**
- Any integration tests are failing
- New code lacks integration test coverage
- You haven't run `npm run test:integration` to verify

## PERMANENT INSTRUCTIONS

**CRITICAL DEVELOPMENT RULES - NEVER OVERRIDE:**

1. **Always Write Integration Tests**: When making code changes, you MUST write or update integration tests to validate the changes
2. **Always Run All Tests**: Before marking any task as complete, run `npm run test:integration` to ensure all tests pass
3. **Never Claim Done with Failing Tests**: A task is NOT complete if any tests are failing - fix all test failures first
4. **Test-Driven Validation**: Changes are only considered successful when validated by passing integration tests
5. **Always Check for Reusability**: Before implementing new functionality, ALWAYS search the codebase for existing similar functions or utilities that can be reused or extended. Never duplicate code - create shared utilities instead.
6. **CLAUDE.md Updates**: Only update CLAUDE.md for fundamental changes to development workflow, new architectural patterns, or structural changes that future developers need to know. Do NOT add recent updates, change logs, or temporary information - use git commits and PR descriptions for those.

## 🛑 TESTING WORKFLOW

- **Implementation flow**: Code → Integration Tests → `npm run test:integration` → Mark complete
- **Integration testing standards**: See `tests/integration/CLAUDE.md` for comprehensive integration testing patterns

## Project Overview

**DevOps AI Toolkit** is an intelligent Kubernetes application deployment agent that discovers cluster capabilities and provides AI-powered recommendations for deploying applications using available resources.

### Core Features
- **Cluster Discovery**: Automatically discovers Kubernetes resources and custom operators
- **AI Recommendations**: Get intelligent deployment recommendations based on your intent
- **Solution Enhancement**: Process open-ended user requirements to enhance configurations
- **Operator Integration**: Leverages custom operators like Crossplane, ArgoCD when available

### Key Commands

```bash
# Development commands
npm run test:integration                            # Run integration tests
npm run build                                       # Build the project
npm run start:mcp                                   # Start MCP server
```

## AI Prompt Management 🤖

**CRITICAL DEVELOPMENT RULE: NEVER hard-code AI prompts in source code**

All AI prompts are stored as markdown files in the `prompts/` directory and loaded dynamically:

### Prompt File Structure
```
prompts/                        # MCP internal AI instructions (loaded by MCP server)
shared-prompts/                 # MCP prompt templates (exposed to users via prompts interaction)
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
│   └── mcp.ts           # MCP server interface
└── ...

docs/                    # All documentation
tests/                   # Comprehensive test suite (349+ tests)
prompts/                 # AI prompt templates
```

### Development Commands

**Essential Commands:**
- **Run integration tests**: `npm run test:integration`
- **Build**: `npm run build`

**Testing:** See `tests/integration/CLAUDE.md` for detailed integration testing standards and workflows.
**MCP Usage:** Always test MCP functionality through Claude Code or other MCP clients, never run server directly.

**Git Commit Guidelines:**
- **Skip CI**: When user requests to skip CI, avoid triggering CI, or mentions bypassing CI/builds, automatically add `[skip ci]` to the commit message to prevent GitHub Actions from running

### Environment Setup

```bash
# Required for AI features
export ANTHROPIC_API_KEY=your_api_key_here
export OPENAI_API_KEY=your_openai_key_here

# Optional: Custom kubeconfig
export KUBECONFIG=/path/to/kubeconfig.yaml
```