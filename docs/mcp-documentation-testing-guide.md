# DevOps AI Toolkit MCP Documentation Testing Guide

**Complete guide for using automated documentation testing through MCP (Model Context Protocol).**

## Prerequisites

Before using this guide, complete the [MCP Setup](mcp-setup.md) to configure your MCP server with:
- DevOps AI Toolkit MCP server running
- `ANTHROPIC_API_KEY` configured
- `DOT_AI_SESSION_DIR` for session storage

## Overview

The DevOps AI Toolkit documentation testing feature provides:
- **Automated content discovery** - Identifies testable sections in documentation
- **Two-phase validation** - Tests both functionality (does it work?) and semantic accuracy (are descriptions truthful?)
- **AI-powered analysis** - Intelligent assessment of documentation quality and accuracy
- **Fix application workflows** - User-driven selection and application of recommended improvements
- **Session management** - Resumable testing sessions for large documentation sets
- **Persistent ignore functionality** - Dismiss issues that shouldn't be flagged in future sessions

## Available MCP Tools

### Core Documentation Testing Tool

#### `mcp__dot-ai__testDocs`
Start or continue automated testing of documentation files.

**Usage:**
```
Use testDocs to validate the accuracy of my README.md file
```

**Parameters:**
- `filePath` (optional): Path to documentation file to test
- `sessionId` (optional): Resume existing testing session

**Returns:**
- Session status and current phase
- Next action prompts or results
- Progress through testing workflow

**Workflow Phases:**
1. **SCAN** - Discover and organize testable content
2. **TEST** - Execute commands and validate content accuracy  
3. **FIX** - Select and apply recommended improvements
4. **DONE** - Session completion

## Complete Workflow Examples

### Example 1: Testing a README File

```
User: I want to test my README.md file to make sure all the examples work

Agent: I'll help you test your README.md file for accuracy. Let me start a documentation testing session.

[Uses mcp__dot-ai__testDocs with filePath "README.md"]

Response: Starting documentation testing session (sess_20240101_abc123)

**SCAN Phase - Content Discovery**
Analyzing README.md structure...

Found 8 testable sections:
1. Installation instructions
2. Quick start example  
3. Configuration options
4. CLI command examples
5. API usage examples
6. Troubleshooting commands
7. Docker deployment steps
8. Testing procedures

Ready to begin testing these sections?

User: Yes, let's test them.

Agent: Perfect! Moving to testing phase.

[Uses mcp__dot-ai__testDocs with the session ID to continue]

Response: **TEST Phase - Section 1/8: Installation Instructions**

Testing installation commands:
✅ `npm install -g my-tool` - Command executes successfully
✅ `my-tool --version` - Returns expected version format
❌ `my-tool init` - Command fails with "config directory not found" 
⚠️  Documentation claims "works out of the box" but requires manual setup

**Items Requiring Attention:**
1. In 'Installation Instructions': Installation doesn't create required config directory. Fix: Add mkdir ~/.my-tool to installation steps
2. In 'Installation Instructions': "Out of the box" claim is inaccurate - setup steps missing. Fix: Update description to "Quick setup after installation"
3. In 'Installation Instructions': Missing troubleshooting information for users. Fix: Include troubleshooting note about config directory

Continue to next section?

User: Let me fix these issues first. Mark issue 1 and 2 as "I'll handle via GitHub issue" and issue 3 as "I'll fix directly in the doc".

Agent: I'll track your fix decisions and continue testing.

[Continues through all 8 sections, identifying issues and collecting fix decisions]

Agent: **Testing Complete! Summary:**

**Tested:** 8 sections
**Items Found:** 15 total
- 6 marked for GitHub issues  
- 4 fixed directly in documentation
- 3 deferred for later review
- 2 failed attempts (need retry)

**FIX Phase Available:** 2 items need retry, others handled

Ready to work on the remaining fixes?

User: Yes, let's fix the remaining items.

Agent: **FIX Phase - Remaining Items**

Item #12: Database connection example shows wrong port (5433 vs 5432)
Item #14: Docker command missing required environment variable

Which would you like to fix first?

User: Fix both directly in the documentation.

Agent: Perfect! I'll mark both as fixed.

[Updates fix tracking and moves to completion]

Agent: **Session Complete!** 

Your README.md testing is finished:
- 8 sections tested
- 15 items identified and resolved
- Documentation accuracy significantly improved

The session results are saved and this document won't show the same issues in future testing sessions.
```

### Example 2: Resuming a Testing Session

```
User: I started testing my docs yesterday but didn't finish. Can you continue where I left off?

Agent: I'll check for your previous documentation testing sessions.

[Uses mcp__dot-ai__testDocs without parameters to show available sessions]

Response: Found existing sessions:

**Active Sessions:**
- sess_20240120_def456: docs/api-guide.md (TEST phase, section 3/7)
- sess_20240119_ghi789: README.md (FIX phase, 4 items pending)

**Completed Sessions:**
- sess_20240118_jkl012: docs/installation.md (DONE)

Which session would you like to resume?

User: Continue with the API guide testing.

Agent: Resuming API guide testing session...

[Uses mcp__dot-ai__testDocs with sessionId "sess_20240120_def456"]

Response: **Resuming TEST Phase - Section 3/7: Authentication Examples**

Previous sections completed:
✅ Section 1: Getting started  
✅ Section 2: Basic API calls

Current section: Authentication examples
Testing JWT token workflow...

✅ Token request example works correctly
❌ Token refresh example has syntax error in curl command
⚠️  Security note mentions deprecated algorithm

Continue with testing or address these issues?

[Session continues from where it left off...]
```

### Example 3: Fix Application Workflow

```
User: I have a documentation testing session with several fix recommendations. Can you help me apply them?

Agent: I'll check your testing session and show available fixes.

[Uses mcp__dot-ai__testDocs to resume session in FIX phase]

Response: **FIX Phase - 8 Items Need Attention**

**Pending Items:**
1. Update Node.js installation command (missing --global flag)
2. Fix API endpoint URL (wrong domain in example)
3. Correct environment variable name (DATABASE_URL vs DB_URL)
4. Add missing prerequisite step (Docker installation)
5. Update deprecated CLI command syntax
6. Fix broken link to configuration documentation
7. Add troubleshooting section for common error
8. Update version numbers in examples (v2.1 → v2.3)

Which items would you like to work on? (Enter numbers like "1,3,5" or "all")

User: I'll fix 1, 2, 3 directly in the docs. Put 4, 7 as GitHub issues. 5, 6, 8 I'll handle later.

Agent: Understood! Let me track your decisions:

**Direct Documentation Fixes:**
- Item 1: Update Node.js installation command ✓
- Item 2: Fix API endpoint URL ✓  
- Item 3: Correct environment variable name ✓

**GitHub Issues:**
- Item 4: Add missing prerequisite step (Docker installation) ✓
- Item 7: Add troubleshooting section for common error ✓

**Deferred:**
- Item 5: Update deprecated CLI command syntax (deferred)
- Item 6: Fix broken link to configuration documentation (deferred)
- Item 8: Update version numbers in examples (deferred)

All decisions recorded! The direct fixes are marked as completed, GitHub issues are marked as handled externally, and deferred items will appear in future testing sessions.

**Session Status:** 8/8 items processed
Ready to complete this testing session?

User: Yes, complete it.

Agent: **Documentation Testing Complete!**

Session sess_20240121_mno345 finished successfully:
- File: docs/user-guide.md
- Sections tested: 6  
- Issues found: 8
- Resolution: 3 fixed, 2 GitHub issues, 3 deferred
- Session saved for future reference

Your documentation quality has been significantly improved! Deferred items will be tracked for future testing sessions.
```

## Session Management

### Understanding Sessions

**Session Lifecycle:**
1. **SCAN Phase** - Content discovery and organization
2. **TEST Phase** - Section-by-section validation (functional + semantic)
3. **FIX Phase** - Issue resolution and fix application  
4. **DONE Phase** - Session completion and cleanup

**Session Persistence:**
- Sessions are automatically saved in `DOT_AI_SESSION_DIR`
- Resume sessions anytime using session ID
- Session data includes progress, results, and fix tracking
- Completed sessions available for reference

### Session Commands

#### Start New Session
```
User: Test my getting-started.md file

Agent: [Uses mcp__dot-ai__testDocs with filePath "getting-started.md"]
```

#### Resume Existing Session  
```
User: Continue my documentation testing

Agent: [Uses mcp__dot-ai__testDocs with sessionId from previous session]
```

#### Check Session Status
```
User: What documentation testing sessions do I have?

Agent: [Uses mcp__dot-ai__testDocs without parameters to list sessions]
```

## Fix Application Workflows

### Fix Status Types

**Fix Status Options:**
- **pending**: Not yet addressed
- **fixed**: Completed (any type of resolution - doc edits, code changes, etc.)
- **deferred**: Handled via external action (GitHub issue, backlog, etc.)  
- **failed**: Attempted but couldn't complete - remains available for retry

### Fix Selection Patterns

#### Individual Selection
```
User: Fix items 1, 3, and 5 directly in the documentation

Agent: Marking items 1, 3, 5 as fixed...
```

#### Bulk Operations
```
User: Mark all the command examples as fixed - I updated them manually

Agent: How many items should I mark as fixed? All command-related recommendations?
```

#### External Handling
```
User: Create GitHub issues for items 2, 4, 6, and 8

Agent: Marking items 2, 4, 6, 8 as deferred (handled externally via GitHub issues)...
```

#### Deferring Items
```
User: I'll handle the broken links later

Agent: Marking link-related items as deferred for future sessions...
```

## Advanced Features

### Persistent Issue Dismissal

**Ignore Comments:**
Add `<!-- dotai-ignore -->` comments to permanently dismiss issues:

```markdown
<!-- dotai-ignore: this command intentionally shows error example -->
```bash
# This command will fail - that's the point
kubectl get nonexistent-resource
```

**This command demonstrates error handling**
```

**Ignore Comment Benefits:**
- Format-agnostic (works in markdown, HTML, etc.)
- Prevents re-detection in future sessions
- Maintains clean documentation without test interference

### Testing Quality Indicators

**Two-Phase Validation:**
1. **Functional Testing** - Do commands execute correctly?
2. **Semantic Validation** - Are descriptions and claims accurate?

**Quality Checklist (Automatic):**
- Command execution verification
- Output format validation  
- Prerequisite checking
- Accuracy of difficulty claims
- Completeness of instruction sets
- User experience assessment

## Troubleshooting

### Common Issues

#### Session Directory Errors

**Symptoms:**
- "Session directory not found" errors
- Cannot save session state

**Solutions:**
1. **Check session directory configuration in MCP setup:**
   ```json
   {
     "env": {
       "DOT_AI_SESSION_DIR": "./tmp/sessions"
     }
   }
   ```

2. **Create directory if missing:**
   ```bash
   mkdir -p ./tmp/sessions
   chmod 755 ./tmp/sessions
   ```

#### File Path Issues

**Symptoms:**
- "File not found" errors
- Cannot start testing session

**Solutions:**
1. **Use correct file paths:**
   ```
   ✅ Correct: "README.md", "docs/api-guide.md"
   ❌ Wrong: "./README.md", "/full/path/README.md" 
   ```

2. **Verify file exists:**
   ```bash
   ls -la README.md
   ls -la docs/api-guide.md
   ```

#### Session Resume Failures

**Symptoms:**
- Cannot resume session
- "Session not found" errors

**Solutions:**
1. **Check session directory:**
   ```bash
   ls -la ./tmp/sessions/
   # Should show session files like sess_20240101_abc123.json
   ```

2. **Verify session ID format:**
   - Correct: `sess_20240101_abc123`
   - Must match exactly from previous session

#### API Key Issues

**Symptoms:**
- "API key invalid" during testing
- Authentication failures

**Solutions:**
1. **Verify API key in MCP configuration**
2. **Check API key permissions** - needs access to Claude 3 models
3. **Test API key independently**

### Debug Information

**Get session details:**
```
User: Show me the details of my current testing session

Agent: [Provides session status, current phase, progress, and any issues]
```

**Check MCP tool availability:**
```
User: What documentation testing tools do you have available?

Agent: I have access to the mcp__dot-ai__testDocs tool for comprehensive documentation testing...
```

## Best Practices

### Effective Testing Strategies

**Document Preparation:**
1. **Start with critical docs** - README, getting started guides, API docs
2. **Test incrementally** - Don't try to test everything at once
3. **Prepare for fixes** - Have editing tools ready for immediate fixes

**Session Management:**
1. **Complete phases sequentially** - Don't skip from SCAN to FIX
2. **Address high-priority issues first** - Focus on user-impacting problems  
3. **Use consistent fix strategies** - Develop patterns for handling different issue types

**Fix Application:**
1. **Group similar fixes** - Handle all command updates together
2. **Use external tracking** - GitHub issues for complex fixes
3. **Document decisions** - Clear reasoning for deferred items

### Quality Improvement Workflows

**Regular Testing Schedule:**
- Test critical documentation monthly
- Test after major feature releases
- Test when onboarding feedback suggests documentation issues

**Issue Prioritization:**
1. **Critical**: Commands that don't work, security issues
2. **High**: Incorrect claims, missing prerequisites
3. **Medium**: Outdated examples, minor inaccuracies
4. **Low**: Style improvements, optional enhancements

**Team Integration:**
- Share testing results with team members
- Use GitHub issues for collaborative fix planning
- Track documentation quality improvements over time

## See Also

- **[MCP Setup Guide](mcp-setup.md)** - Initial MCP server configuration
- **[MCP Recommendation Guide](mcp-recommendation-guide.md)** - Kubernetes deployment recommendations
- **[Best Practices Guide](docs-testing-best-practices.md)** - Advanced documentation testing methodology