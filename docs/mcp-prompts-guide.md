<!-- PRD-29 -->
# MCP Prompts Guide: Shared Prompt Library

## What are MCP Prompts

MCP Prompts provide a centralized way to share and discover prompts across projects and team members. Instead of manually copying prompt files between projects, prompts are served directly through the dot-ai MCP server and automatically appear as native slash commands in MCP-enabled coding agents.

**Key Benefits:**
- **Zero setup**: Connect to MCP server and prompts are immediately available
- **Native integration**: Prompts appear as slash commands in your coding agent's command menu
- **Cross-project sharing**: Same prompts available across all projects without file management
- **Instant updates**: New prompts added to server are immediately available to all users
- **Team consistency**: Everyone uses the same proven prompts

## Prerequisites

Before using MCP Prompts, you need:
- **MCP-enabled coding agent** (Claude Code, Cursor, or VS Code with MCP extension)  
- **Successfully configured dot-ai MCP server connection**

**Setup Required**: Follow the [MCP Setup Guide](./mcp-setup.md) to configure your environment before proceeding.

**Note**: The Anthropic API key is only required for AI-powered tools (like deployment recommendations), not for using the shared prompts library.

## How It Works

The dot-ai MCP server implements the standard MCP Prompts specification, exposing two key endpoints:

- **`prompts/list`**: Returns all available prompts with metadata
- **`prompts/get`**: Returns specific prompt content by ID

When you connect to the MCP server, your coding agent automatically discovers available prompts and makes them accessible through agent-specific interfaces. The access method varies by agent - some use slash commands, others integrate prompts as available tools.

## Using Shared Prompts

### Discovering Available Prompts

1. Ensure you're connected to the dot-ai MCP server (see [MCP Setup Guide](./mcp-setup.md))
2. Access prompts using your agent's interface:
   - **Claude Code**: Type `/` and look for `/dot-ai:prompt-name` commands
   - **VS Code + GitHub Copilot**: Use `/mcp.dot-ai.prompt-name` format
   - **Cursor**: Ask the agent to use specific prompts by name from available tools
3. Browse available prompts through your agent's discovery interface

### Executing Shared Prompts

Using shared prompts varies by coding agent:

**Claude Code:**
```bash
# Create a new PRD
/dot-ai:prd-create

# Get current PRD status
/dot-ai:prds-get
```

**VS Code + GitHub Copilot:**
```bash
# Create a new PRD
/mcp.dot-ai.prd-create

# Get current PRD status
/mcp.dot-ai.prds-get
```

**Cursor:**
```
# Ask the agent to use the tool by name
Use the prd-create prompt to create a new PRD
Run the prds-get prompt to show current PRD status
```

The prompt content executes exactly as if it were a local command file, but without any file management on your part.

## Available Prompts

### Project Management Prompts

**`prd-create`**
- **Purpose**: Create a comprehensive Product Requirements Document following documentation-first approach
- **Use when**: Starting a new feature that requires detailed planning, tracking, and documentation
- **Example**: Beginning work on a new feature or major enhancement

**`prds-get`**
- **Purpose**: Fetch all open GitHub issues with 'PRD' label from the current project repository
- **Use when**: Want to see all active Product Requirements Documents and their status
- **Example**: Getting overview of current project priorities and PRD status

**`prd-next`**
- **Purpose**: Analyze existing PRD to identify and recommend the single highest-priority task to work on next
- **Use when**: Need guidance on what to work on next within a PRD, uses smart auto-detection of target PRD
- **Example**: Continuing work on a PRD and need to prioritize remaining tasks

**`prd-start`**
- **Purpose**: Start working on a PRD implementation
- **Use when**: Beginning work on a specific PRD
- **Example**: Moving from planning phase to implementation phase

**`prd-update-progress`**
- **Purpose**: Update PRD progress based on git commits and code changes, enhanced by conversation context
- **Use when**: Implementation work has been completed and need to mark PRD items as done based on actual code changes
- **Example**: After completing development tasks, update PRD to reflect current status

**`prd-update-decisions`**
- **Purpose**: Update PRD based on design decisions and strategic changes made during conversations
- **Use when**: Architecture, workflow, or requirement decisions were made in conversation that need to be captured in the PRD
- **Example**: After making architectural decisions that affect the original PRD scope

**`prd-done`**
- **Purpose**: Complete PRD implementation workflow - create branch, push changes, create PR, merge, and close issue
- **Use when**: Finished implementing a PRD and ready to deploy and close out the work
- **Example**: All PRD tasks completed and ready for final deployment and closure

### Development Prompts

**`tests-reminder`**
- **Purpose**: Remind about mandatory testing requirements when making code changes
- **Use when**: Before marking any task as complete to ensure all tests are written, run, and passing
- **Example**: Before completing implementation work to verify testing standards are met

### Session Management Prompts

**`context-save`**
- **Purpose**: Save current work context to tmp/context.md for session continuity
- **Use when**: Ending a work session or at key milestones to preserve state for future sessions
- **Example**: Before taking a break or switching tasks to preserve current progress

**`context-load`**
- **Purpose**: Load saved context from tmp/context.md to resume previous work sessions
- **Use when**: Starting a new session and need to continue where you left off previously
- **Example**: Beginning a new coding session and want to resume previous work

## Example Workflows

### Workflow 1: Complete PRD Lifecycle

- **Start new feature**: Use `prd-create` prompt to create comprehensive requirements document
  1. GitHub issue created with PRD label
  2. PRD file generated with proper naming
  3. Complete documentation content written across multiple files with traceability

- **Check priorities**: Use `prds-get` prompt to see all active PRDs and priorities
  1. Open PRD issues fetched from GitHub
  2. Issues formatted with status analysis
  3. Next steps recommendations provided

- **Begin implementation**: Use `prd-start` prompt to begin working on specific PRD
  1. Target PRD auto-detected from context
  2. PRD readiness validated
  3. Feature branch created
  4. First implementation task identified with detailed plan

- **Get next task**: Use `prd-next` prompt to identify highest-priority remaining work
  1. Current PRD state analyzed
  2. Single highest-value next task identified
  3. Implementation design guidance provided

- **Update decisions**: Use `prd-update-decisions` prompt when design decisions are made during implementation
  1. Conversation context analyzed for design decisions
  2. Decision impact assessed across requirements and scope
  3. PRD sections updated with new decisions and rationale

- **Update progress**: Use `prd-update-progress` prompt after completing implementation tasks
  1. Git commits and code changes analyzed
  2. Changes mapped to PRD requirements
  3. PRD checkboxes updated with work log entry

- **Finalize**: Use `prd-done` prompt to deploy, merge, and close out completed work
  1. Pre-completion validation performed
  2. Pull request created and merged
  3. GitHub issue closed with final validation

### Workflow 2: Session Continuity

- **End of session**: Use `context-save` prompt to preserve current work state
  1. Current work context analyzed
  2. Context saved to tmp/context.md file

- **Resume later**: Use `context-load` prompt to restore previous context
  1. Saved context loaded from tmp/context.md
  2. Previous work state restored

- **Maintain quality**: Use `tests-reminder` prompt before marking tasks complete
  1. Testing requirements reviewed
  2. Quality checklist provided

## Managing Prompts

### Adding New Prompts

> **Note**: This section documents the planned prompt management interface

To add a new prompt to the shared library:

1. **Create prompt content**: Write the prompt following established patterns
2. **Define metadata**: Set name, description, and category
3. **Add to library**: Use the prompt management interface
4. **Test across clients**: Verify prompt works in different coding agents
5. **Update documentation**: Add prompt to the "Available Prompts" section above

### Prompt Organization

Prompts are organized by category:
- **`project-management`**: PRD lifecycle and project tracking prompts
- **`development`**: Code development and quality assurance prompts
- **`session-management`**: Work session continuity and context management

### Naming Conventions

- Use descriptive, kebab-case names: `prd-create`, `context-save`
- Include category prefix when helpful: `prd-next`, `context-save`
- Keep names concise but clear
- Avoid special characters or spaces

## Cross-Agent Compatibility

### Supported Coding Agents

**Claude Code**: ✅ Full support
- Native slash command integration
- Prompt discovery through command menu
- Prompts appear as `/dot-ai:prompt-name`

**Other MCP-Enabled Agents**: 🤔 Expected to work (not validated)
- Other agents should work since they follow MCP specifications, but this hasn't been validated
- Cursor and VS Code with MCP extensions are expected to support prompts via different interfaces
- **Help us validate**: Try these prompts in your agent and [report your experience via GitHub issues](https://github.com/vfarcic/dot-ai/issues)

### Agent-Specific Notes

**Claude Code**:
- Prompts appear as `/dot-ai:prompt-name`
- Full metadata support (descriptions in command menu)
- Seamless integration with existing workflow

**VS Code + GitHub Copilot**: *(not yet tested)*
- Prompts expected to appear as `/mcp.dot-ai.prompt-name`
- Should work through chat interface slash commands
- Expected integration with existing Copilot workflow

**Cursor**: *(not yet tested)*
- Prompts expected to appear as available tools in agent interface
- Should work by asking agent to use specific prompt by name
- Expected automatic tool discovery and integration

**Other Agents**: *(not yet tested)*
- Different agents may use different slash command formats
- Some agents may have different prompt discovery mechanisms
- Please test and report your experience via GitHub issues

## Contributing Prompts

Have a useful prompt to share? Contribute it to the shared library:

1. **Fork the repository** and create a feature branch
2. **Add your prompt** to the `shared-prompts/` directory following existing naming conventions
3. **Update the documentation** by adding your prompt to the "Available Prompts" section above
4. **Submit a pull request** with a clear description of what the prompt does and when to use it

### Prompt Metadata Format

Each prompt file must include YAML frontmatter that defines how it appears in coding agents:

```yaml
---
name: your-prompt-name
description: Brief description of what this prompt does
category: project-management
---

# Your Prompt Content

Your prompt instructions go here...
```

**Metadata Fields:**
- **`name`**: Becomes the slash command name (e.g., `name: prd-create` → `/dot-ai:prd-create`)
- **`description`**: Shows up in coding agent command menus and help text
- **`category`**: Used for organizing prompts in documentation (must be one of: `project-management`, `development`, `session-management`)

**How It Works:**
1. **MCP Server Processing**: The dot-ai MCP server reads these metadata fields from all prompt files
2. **Standard MCP Endpoints**: Metadata is exposed via `prompts/list` and `prompts/get` MCP endpoints
3. **Agent Integration**: Your coding agent discovers prompts through these endpoints and makes them available as slash commands
4. **User Experience**: The `name` becomes the command, `description` appears in menus, and `category` organizes documentation

**Contribution Guidelines:**
- Use descriptive, kebab-case names (e.g., `database-optimization`, `api-security-review`)
- Include clear purpose and usage examples in your PR description
- Test your prompt across different scenarios before contributing
- Follow the established prompt format and documentation patterns

## Troubleshooting

### Common Issues

**Prompts don't appear in command menu**
- **Cause**: MCP server not connected or prompts capability not enabled
- **Solution**: Check MCP connection status and server configuration
- **See**: [MCP Setup Guide](./mcp-setup.md) for connection troubleshooting

**Prompt execution fails with "not found" error**
- **Cause**: Prompt ID mismatch or server synchronization issue
- **Solution**: Refresh MCP connection or restart your coding agent
- **Workaround**: Disconnect and reconnect to MCP server

**Prompts work in one agent but not another**
- **Cause**: Agent-specific MCP implementation differences
- **Solution**: Check agent-specific compatibility notes above
- **Alternative**: Use a fully compatible agent for prompt-heavy workflows
