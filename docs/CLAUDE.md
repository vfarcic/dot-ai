# Documentation Directory - Claude Code Instructions

## Documentation Standards & Format

### File Structure Requirements
- **Filename format**: Use kebab-case with descriptive names (`mcp-tools-overview.md`, `setup/mcp-setup.md`)
- **Directory organization**: Group related docs in subdirectories (`setup/`, guides, references)
- **Consistent naming**: Use prefix patterns (`mcp-` for MCP-related guides, `setup/` directory for setup guides)

### Documentation Format Standards
- **H1 Title**: One H1 per file with descriptive title and bold summary line
- **Overview section**: Always include "What it does", "Use when", and "📖 Full Guide" links where applicable
- **Table format**: Use comparison tables for method/option comparisons with Pros/Cons/Best For columns
- **Status indicators**: Use emoji indicators (✅ ❌ 🎯 🚀 🔧) for recommendations and status
- **Code blocks**: Always use syntax highlighting (```bash, ```yaml, ```json)
- **Cross-references**: Link related documentation with relative paths
- **Decision trees**: Use clear "🎯 Recommended" and alternative flow patterns

### Command and Example Validation Rules

**🚨 CRITICAL REQUIREMENT: All commands and examples MUST be validated before inclusion**

#### Before Adding Any Command or MCP Tool Example:
1. **Execute the command** or **call the MCP tool** to verify it works
2. **Capture actual output** and use real output in examples (not placeholder text)
3. **Test error scenarios** to ensure error examples are accurate
4. **Verify syntax** - especially for complex commands with multiple parameters

#### For MCP Tool Documentation:
- **Test each tool call** with realistic parameters before documenting
- **Use actual responses** in examples instead of "..." or placeholder content  
- **Validate parameter requirements** by testing with missing/invalid parameters
- **Check current tool capabilities** - never assume features exist without testing

#### For Shell Commands:
- **Run every command** in a test environment before documenting
- **Include actual output** where relevant (truncated if very long)
- **Test with different environments** if the command is environment-dependent
- **Verify prerequisites** by testing without required dependencies

#### For Configuration Examples:
- **Test configuration files** to ensure they work as documented
- **Validate YAML/JSON syntax** using parsers
- **Test with realistic values** not just placeholder examples

### Content Quality Standards
- **Accuracy first**: Never guess command syntax or outputs - always verify
- **Real examples**: Use actual working examples from testing, not theoretical ones
- **Current information**: Verify feature availability and syntax before documenting
- **User perspective**: Write from the user's workflow perspective, not implementation details

### README.md Coordination
- **Keep README.md current**: When adding new major features or setup methods to docs, update the root README.md
- **Maintain consistency**: Ensure terminology and descriptions match between README.md and detailed docs
- **Update cross-references**: When restructuring docs, update README.md links
- **Sync feature lists**: Major feature additions should be reflected in both README.md overview and detailed guides

### Validation Workflow

**🚨 MANDATORY: Execute-then-document, one item at a time.**

For each command/example in documentation:
1. Execute it and capture actual output
2. Document that item with real output
3. Move to next item and repeat

**NEVER** batch-write multiple examples then test afterward. Validate each step before proceeding to the next.

## ⚠️ MCP DOCUMENTATION ANTI-PATTERNS (NEVER DO THIS)

**CRITICAL: MCP Client Workflow Alignment**

❌ **Manual Server Commands**: Never document commands users run directly:
- `node dist/mcp/server.js` (users never run this)
- Direct HTTP calls to the MCP server (users interact through MCP clients)

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
- `kubectl logs` for MCP server (users won't typically run this)
- `curl` to MCP endpoints (users won't run this)
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

### Common Mistakes to Avoid
- ❌ Adding command examples without testing them first
- ❌ Using outdated or deprecated syntax
- ❌ Copying examples from other projects without validation
- ❌ Assuming MCP tool parameters or outputs without testing
- ❌ Forgetting to update README.md when adding major new documentation
- ❌ Using placeholder text instead of real examples
- ❌ Documenting manual server commands instead of MCP client workflow
- ❌ Including debugging commands users won't actually run

Remember: Documentation credibility depends on accuracy. One broken example undermines trust in the entire guide.