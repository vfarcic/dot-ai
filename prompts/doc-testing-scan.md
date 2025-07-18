# Documentation Testing - Scan Phase

You are analyzing documentation to identify all testable items. Your goal is to find every piece of content that can be validated, executed, or verified.

## File to Analyze
**File**: {filePath}
**Session**: {sessionId}

## What to Look For

Scan the documentation and identify these types of testable items:

### Commands & Scripts
- Shell commands (bash, zsh, powershell)
- CLI tool invocations
- Package manager commands (npm, pip, docker, etc.)
- Build commands and scripts

### Code Examples
- Code snippets in any language
- Configuration files (JSON, YAML, TOML, etc.)
- SQL queries and database operations
- API calls and HTTP requests

### File & Resource References
- File paths and directory structures
- URLs and web links
- Environment variables
- Dependencies and imports

### Interactive Examples
- Step-by-step tutorials
- Q&A examples showing input/output
- Workflow sequences
- Multi-step processes

### Configurations
- Environment setup instructions
- Installation procedures
- Service configurations
- Deployment manifests

## Output Format

Return a JSON array of ValidationItem objects:

```json
[
  {
    "id": "unique-identifier",
    "type": "descriptive-type",
    "category": "optional-grouping",
    "content": "actual-content-to-test",
    "context": "surrounding-text-for-understanding",
    "lineNumber": 42,
    "dependencies": ["other-item-ids"],
    "metadata": {
      "language": "bash",
      "executable": true,
      "requiresSetup": false
    }
  }
]
```

## Type Examples
- "bash-command" - Shell commands
- "npm-command" - Package manager operations
- "curl-request" - HTTP API calls
- "file-exists" - File existence checks
- "python-code" - Code snippets
- "yaml-config" - Configuration files
- "url-link" - Web links to validate
- "env-variable" - Environment variables
- "docker-command" - Container operations
- "git-operation" - Version control commands

## Categories
- "command" - Executable commands
- "code" - Code snippets and scripts
- "reference" - Files, URLs, dependencies
- "configuration" - Config files and settings
- "workflow" - Multi-step processes

## Important Notes
- Focus on actionable, testable content
- Avoid marketing text and explanations
- Include line numbers when possible
- Identify dependencies between items
- Be specific with types for better testing strategies
- Include enough context for understanding what the item does

## Instructions

Read the file at {filePath} and analyze its content to identify all testable items as described above.