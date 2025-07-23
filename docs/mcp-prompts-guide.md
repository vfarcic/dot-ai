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

## How It Works

The dot-ai MCP server implements the standard MCP Prompts specification, exposing two key endpoints:

- **`prompts/list`**: Returns all available prompts with metadata
- **`prompts/get`**: Returns specific prompt content by ID

When you connect to the MCP server, your coding agent automatically discovers available prompts and makes them available as slash commands. The exact format depends on your agent, but typically follows patterns like `/mcp__dot-ai__prompt-name`.

## Using Shared Prompts

### Discovering Available Prompts

1. Ensure you're connected to the dot-ai MCP server (see [MCP Setup Guide](./mcp-setup.md))
2. In your coding agent, access the command palette (for example, type `/` in Claude Code)
3. Look for commands starting with your server prefix (e.g., `/mcp__dot-ai__`) - these are shared prompts
4. Browse the list to see all available prompts with descriptions

### Executing Shared Prompts

Using shared prompts works like any other slash command in your coding agent:

```bash
# Create a new PRD
/mcp__dot-ai__prd-create

# Get current PRD status
/mcp__dot-ai__prds-get

# Test documentation accuracy
/mcp__dot-ai__test-docs
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

### Documentation Prompts

**`test-docs`**
- **Purpose**: Validate documentation against actual code implementation by functionally testing all commands, examples, and workflows
- **Use when**: Need to verify documentation accuracy, detect content drift, find broken examples, or validate that documented features actually work
- **Example**: After code changes to ensure documentation still matches implementation

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

1. **Start new feature**: Use `prd-create` to create comprehensive requirements document
2. **Check priorities**: Use `prds-get` to see all active PRDs and priorities
3. **Begin implementation**: Use `prd-start` to begin working on specific PRD
4. **Get next task**: Use `prd-next` to identify highest-priority remaining work
5. **Update progress**: Use `prd-update-progress` after completing implementation tasks
6. **Finalize**: Use `prd-done` to deploy, merge, and close out completed work

### Workflow 2: Documentation-Driven Development

1. **Create feature docs**: Document the feature as if it already exists
2. **Validate documentation**: Use `test-docs` to ensure all examples and commands work
3. **Implement to match docs**: Build functionality that matches documented behavior
4. **Re-validate**: Use `test-docs` again to confirm implementation matches documentation
5. **Update PRD**: Use `prd-update-progress` to mark documentation and implementation complete

### Workflow 3: Session Continuity

1. **End of session**: Use `context-save` to preserve current work state
2. **Resume later**: Use `context-load` to restore previous context
3. **Continue work**: Use `prd-next` to identify next priority task
4. **Maintain quality**: Use `tests-reminder` before marking tasks complete

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
- **`documentation`**: Documentation creation and validation prompts
- **`session-management`**: Work session continuity and context management

### Naming Conventions

- Use descriptive, kebab-case names: `prd-create`, `test-docs`
- Include category prefix when helpful: `prd-next`, `context-save`
- Keep names concise but clear
- Avoid special characters or spaces

## Cross-Agent Compatibility

### Supported Coding Agents

**Claude Code**: ✅ Full support
- Native slash command integration
- Prompt discovery through command menu
- Prompts appear as `/mcp__dot-ai__prompt-name`

**Other MCP-Enabled Agents**: 🔄 Testing in progress
- Support varies by agent and MCP implementation
- For example, Cursor and VS Code with MCP extensions may have different behaviors
- See compatibility notes below

### Agent-Specific Notes

> **Note**: This section will be updated as cross-agent testing is completed

**Claude Code**:
- Prompts appear as `/mcp__dot-ai__prompt-name`
- Full metadata support (descriptions in command menu)
- Seamless integration with existing workflow

**Other Agents**:
- Compatibility testing in progress
- Different agents may use different slash command formats
- Some agents may have different prompt discovery mechanisms
- Specific differences will be documented here as testing completes

## Contributing Prompts

Have a useful prompt to share? Contribute it to the shared library:

1. **Fork the repository** and create a feature branch
2. **Add your prompt** to the `shared-prompts/` directory following existing naming conventions
3. **Update the documentation** by adding your prompt to the "Available Prompts" section above
4. **Submit a pull request** with a clear description of what the prompt does and when to use it

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
