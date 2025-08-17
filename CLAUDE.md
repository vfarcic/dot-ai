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

- **Implementation flow**: Code → Tests → `npm test` → Mark complete
- **Test organization**: Mirror source code structure (`src/core/schema.ts` → `tests/core/schema.test.ts`)

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
npm test                                            # Run all tests
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

## ⚠️ MCP DOCUMENTATION ANTI-PATTERNS (NEVER DO THIS)

**CRITICAL: MCP Client Workflow Alignment**

❌ **Manual Server Commands**: Never document commands users run directly:
- `npx @vfarcic/dot-ai` (users never run this)
- `docker compose up` (users never run this) 
- `node dist/mcp/server.js` (users never run this)

✅ **MCP Client Workflow**: Document only what users actually do:
- Create `.mcp.json` configuration
- Start MCP client (Claude Code, Cursor, etc.)
- Use features through MCP client interaction

❌ **Server Lifecycle Management**: Never document manual server operations:
- Starting/stopping servers manually
- Restarting services for troubleshooting
- Manual container/process management

✅ **Client-Managed Lifecycle**: Document that MCP client handles everything:
- Client starts servers automatically
- Client manages server lifecycle
- Client handles cleanup when needed

❌ **Manual Debugging Commands**: Never document CLI debugging:
- `docker logs dot-ai` (users won't run this)
- `curl http://localhost:6333` (users won't run this)
- Manual health checks or status commands

✅ **MCP-Based Diagnostics**: Use client-integrated diagnostics:
- `"Show dot-ai status"` command (primary diagnostic)
- Client-visible error messages
- MCP tool-based troubleshooting

**WHY THIS MATTERS:**
- Users interact with MCP servers through clients, not directly
- Manual commands create documentation that doesn't match actual user workflow
- Creates confusion between "how it works" vs "how users use it"
- Violates the fundamental MCP interaction pattern

**VALIDATION CHECK**: If documentation includes commands users type in terminal (other than MCP client setup), it's probably wrong.

### Testing & Development

**MANDATORY TESTING WORKFLOW:**
- **Always write tests** for code changes before considering work complete
- **Always run all tests** with `npm test` before marking tasks as done
- **Never mark task complete** if any tests are failing
- **Always check CLAUDE.md** after task completion for needed updates

**Commands:**
- **Run tests**: `npm test`
- **Build**: `npm run build`

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