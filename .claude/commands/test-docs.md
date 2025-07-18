# Test Documentation

Validate documentation against actual code implementation to detect content drift, outdated information, and inconsistencies.

## 🚨 MANDATORY FUNCTIONAL TESTING 🚨

**YOU MUST TEST ALL DOCUMENTED FUNCTIONALITY - NO EXCEPTIONS**

- ✅ **EXECUTE**: All commands, scripts, and code examples exactly as documented
- ✅ **NAVIGATE**: All URLs, web interfaces, and interactive flows
- ✅ **TEST**: All APIs, integrations, and external services
- ✅ **VALIDATE**: All configurations, file formats, and data structures
- ✅ **REPRODUCE**: All workflows, tutorials, and step-by-step processes
- ❌ **NEVER**: Skip functional testing for any reason
- ❌ **NEVER**: Only check syntax or run help commands

**FUNCTIONAL TESTING FIRST**: Always prioritize actually using/testing documented features over theoretical validation.

## 🔄 CONTINUOUS VALIDATION REQUIREMENT 🔄

**CRITICAL: UPDATE VALIDATION REPORT IMMEDIATELY AFTER EACH TEST**

- **Test → Update → Test → Update** - Never batch updates
- **Check off items in checklist** as soon as they're tested
- **Add results to "Functional Testing Performed"** section immediately
- **Document issues in "Issues Found"** section as soon as discovered
- **Update section status** as soon as each section is completed
- **Never wait until end** - validation report must be current at all times

**VALIDATION REPORT MUST BE LIVE DOCUMENT**: Shows real-time progress, not end-of-process summary.

## Usage

```
/test-docs [file-path]
```

You must specify which documentation file to validate. Common options:
- `README.md` - Main project documentation
- `docs/api.md` - API documentation  
- `docs/setup.md` - Setup instructions
- `CONTRIBUTING.md` - Contribution guidelines
- Any other documentation file in the project

## Validation Philosophy

**Documentation Drift Detection**: Ensures documentation accurately reflects current reality by comparing claims against actual implementation.

**Three-Layer Validation:**
1. **Structural**: File existence, syntax correctness, link validity
2. **Semantic**: Content accuracy against code/system implementation  
3. **Consistency**: Cross-document consistency and logical coherence

## Assumptions

- **Prerequisites met**: All requirements mentioned in documentation are installed and configured
- **Commands available**: All binaries/commands referenced in documentation are available in PATH
- **Environment configured**: Environment variables and settings mentioned in documentation are properly set and available
- **Working context**: Required directories, files, and access permissions exist per documentation
- **Skip setup sections**: Does not validate installation procedures or environment setup
- **Execute as documented**: Run commands exactly as shown in documentation, using existing environment variables
- **Adapt dynamic values**: Replace placeholder values with actual outputs from previous commands

## Validation Categories

### ✅ Always Validate:

#### Structural Validation
- **File paths and links**: Existence, accessibility, correct paths
- **Configuration syntax**: JSON/YAML parsing, schema validation
- **Command syntax**: Well-formed commands, valid flags/options

#### Semantic Validation (Code vs Documentation)
- **Command execution**: Documented commands vs actual behavior when run
- **Command name accuracy**: Verify exact command names match CLI help output - compare documented command names against actual CLI commands
- **Content accuracy**: Verify that documented descriptions match actual behavior - focus on meaning correctness rather than exact text matching
- **Workflow outcomes**: Validate that documented processes produce the described results or equivalent functionality
- **Configuration examples**: Documented configs vs actual parsing/validation
- **Code examples**: Syntax correctness and functional accuracy
- **Version claims**: Documented versions vs actual requirements/availability
- **Feature descriptions**: Documented capabilities vs verifiable implementation

#### Cross-Reference Validation
- **Internal links**: Documentation cross-references and consistency
- **Version consistency**: Version claims across multiple documentation sources
- **Content accuracy**: Claims that can be verified against actual system behavior

### ❌ Never Validate:
- **Pure marketing/positioning statements**
  - "Who is this for?" sections
  - Competitive advantages
  - Subjective benefit claims without verifiable outcomes
- **Aspirational content**
  - Future roadmap items
  - Planned features
  - "Coming Soon" capabilities
- **Purely subjective claims**
  - "easy", "powerful", "intuitive" without context
  - User experience assertions without measurable criteria

### ⚠️ Validate with Semantic Focus:
- **Feature descriptions**: Validate claimed capabilities even without concrete examples
- **Workflow examples**: Validate if they demonstrate actual command sequences and achievable outcomes
- **Interactive examples**: Validate if they show realistic user interactions with the system
- **Multi-step processes**: Validate if documented processes work end-to-end
- **Performance claims**: Validate if they make testable assertions about system behavior
- **High-level descriptions**: Validate if they make verifiable claims about functionality

### 🤔 Context-Dependent (Validate with Caution):
- **Troubleshooting solutions**
  - ✅ Validate: Command syntax, availability, and verifiable resolution claims
  - ⚠️ Validate carefully: Whether solutions achieve expected outcomes (may require specific error conditions)
- **Workflow examples**
  - ✅ Validate: Command syntax, sequence logic, and expected outcomes
  - ⚠️ Validate carefully: End-to-end functional results (adapt to actual system state)
- **Documentation links**
  - ✅ Validate: File existence, accessibility, and description accuracy
  - ⚠️ Validate carefully: Semantic match between link description and actual content

## Validation Process

### 1. Single-Pass Sequential Validation
- **Start by creating dynamic checklist** - Scan entire document first to identify all testable items
- **Generate checklist from actual content** - Add specific commands, files, URLs, workflows found in the documentation
- **🔍 COMPREHENSIVE CONTENT SCAN** - Look for ALL testable content types:
  - Commands in code blocks (```bash, ```shell, etc.)
  - Interactive examples and conversations
  - Step-by-step workflows and tutorials
  - Configuration files and data structures
  - API calls and web requests
  - File references and links
  - Multi-part processes and sequences
  - Example outputs and expected results
- **Start at document top** - Begin with document title/header
- **Process each section as encountered** - Validate content within each major section (# ## ### headers)
- **🔄 IMMEDIATE UPDATE AFTER EACH TEST** - Update validation report after every single test
- **Check off items as tested** - Mark checklist items as completed when functionally verified
- **Track inline** - Write section completion and issues to `tmp/validation-report.md` as you go
- **Section identification**: Major sections are markdown headers (# ## ###), code blocks (```), and workflow examples
- **Content validation**: Within each section, validate all commands, configs, links, and examples found
- **Never stop on failures** - Complete entire document validation
- **Skip non-validatable content** - Clearly state when skipping marketing/aspirational content
- **Ensure all checklist items completed** - Validation is not complete until every applicable box is checked
- **🚨 NEVER BATCH UPDATES** - Update report immediately after each test, not at the end

### 2. Issue Types
- **File/Link missing**: Referenced file or link doesn't exist
- **Command doesn't work**: Documented command fails when executed
- **Configuration invalid**: Syntax errors or schema violations in configuration examples
- **Functional mismatch**: Command/code works but produces different output than described
- **Semantic mismatch**: Documented descriptions don't match actual behavior or outcomes
- **Version mismatch**: Documented versions don't match actual requirements/availability
- **Content inaccuracy**: Documented claims don't match verifiable reality
- **Workflow sequence invalid**: Documented multi-step processes don't work end-to-end
- **Example flow mismatch**: Interactive examples don't align with actual system behavior

### 3. Validation Standards
- **Execute, don't just analyze**: Actually run commands rather than just checking code
- **Functional over comprehensive**: If documented command works, it's valid (even if other options exist)
- **User experience focus**: Test what users would actually encounter, not internal implementation details
- **Semantic accuracy over literal matching**: Validate that documented meaning matches actual behavior, not exact text output
- **Intent-based validation**: Check if documented workflows achieve their stated goals, even if implementation details differ

### 4. Validation Actions

**MANDATORY FUNCTIONAL ACTIONS** (must be performed for all applicable content):

- **Execute all commands**: Run every documented command/script/code example
- **Navigate all URLs**: Visit every documented link, webpage, UI flow
- **Test all APIs**: Call every documented API endpoint, service, integration
- **Parse all configs**: Load/validate every configuration file, JSON, YAML, etc.
- **Reproduce all workflows**: Follow every tutorial, multi-step process end-to-end
- **Test all examples**: Validate every interactive example, conversation, demonstration
- **Verify all claims**: Test every documented behavior, feature, capability
- **Validate all sequences**: Test multi-step processes, command chains, workflow dependencies
- **Check all outputs**: Verify expected results, responses, and outcomes match reality

**SUPPORTING ACTIONS** (supplement functional testing):

- **File/Link checks**: Verify file existence and accessibility
- **Syntax validation**: Check code syntax and structure
- **Cross-reference checks**: Verify consistency across documentation
- **Version verification**: Confirm documented versions match reality

**EXECUTION TRACKING**: Document in validation report:
- Which commands/URLs/APIs were actually tested
- What the actual results were vs. documented expectations
- Any functional mismatches or failures found

### 4.1 Workflow Validation
- **Identify command sequences**: Detect multi-step workflows in documentation
- **Execute sequentially**: Run commands in documented order
- **Adapt to outputs**: Use actual results from previous commands (e.g., real solution IDs)
- **Validate flow**: Ensure each step works with previous step's output
- **Test user experience**: Verify documented workflows actually work end-to-end

### 4.2 Execution Environment
- **Use local directories**: Always use project-relative paths (e.g., `./tmp/test-sessions`) instead of system temp directories like `/tmp`
- **Separate session validation**: Run commands in isolated context without current development setup
- **Clean environment**: Test what users would actually experience, not just what works in development
- **User simulation**: Execute commands as if following documentation for the first time
- **Environment variable usage**: Use existing environment variables as-is (per assumptions above) - do not override with test values

### 4.3 Issue Resolution
- **Detect and explain**: Identify specific problems with clear reasoning
- **Document only**: Write to `tmp/validation-report.md` - do not attempt fixes
- **Continue validation**: Proceed to next section regardless of current issue

### 4.4 Content Type Validation
- **Command examples**: Execute documented commands to verify they work
- **Configuration examples**: Parse and validate syntax/structure
- **Code samples**: Check syntax and basic functionality
- **Workflow sequences**: Test multi-step processes end-to-end
- **File references**: Verify referenced files exist and are accessible
- **URLs/Links**: Check external links are accessible
- **Installation instructions**: Validate steps can be executed (if not in skip list)

### 5. Output Format

**File Structure**: Use `tmp/validation-report.md` following this structure (adapt content to actual document):

```markdown
# Validation Report: [DOCUMENT_NAME]

## 🚨 TESTING CHECKLIST (Generated from Document Content)

**Found in documentation - MUST be tested:**
- [ ] [Item type]: `[specific item]` - [ACTION REQUIRED]
- [ ] [Item type]: `[specific item]` - [ACTION REQUIRED]

**Examples of checklist items:**
- [ ] Command: `npm install -g package` - EXECUTE and verify installation
- [ ] Workflow: Setup steps 1-5 - REPRODUCE end-to-end
- [ ] File: `config.json` - VALIDATE syntax and functionality  
- [ ] Link: `docs/guide.md` - VERIFY exists and content matches description
- [ ] API: `POST /api/endpoint` - TEST and verify response
- [ ] URL: `https://example.com` - NAVIGATE and verify accessibility
- [ ] Example: "User conversation flow" - REPRODUCE interactive pattern
- [ ] Sequence: "Tool A → Tool B → Tool C" - VALIDATE dependency chain
- [ ] Output: "Expected result X" - VERIFY actual output matches claim

**CHECKLIST STATUS INDICATORS:**
- [x] **COMPLETED** - Successfully tested and verified
- [ ] **PENDING** - Not yet tested
- [~] **SKIPPED** - Intentionally not tested (marketing content, etc.)
- [!] **BLOCKED** - Cannot test due to dependency failure or prerequisite issue

**DEPENDENCY HANDLING:**
- When a command/workflow fails, mark dependent items as [!] BLOCKED
- Document the blocking issue and dependency chain
- Count BLOCKED items separately in completion verification
- BLOCKED items do not count against completion percentage

**COMPREHENSIVE SCAN REQUIREMENT**: 
- Scan ENTIRE document before creating checklist
- Include ALL sections, subsections, code blocks, and examples
- Don't miss interactive examples, conversations, or workflow demonstrations
- Capture multi-step processes and command sequences
- Include troubleshooting steps and example solutions

**Testing principle: Every documented claim, example, or instruction must be functionally verified**

**VALIDATION IS NOT COMPLETE UNTIL ALL BOXES ARE CHECKED**

## 🛑 MANDATORY COMPLETION VERIFICATION 🛑

**BEFORE CLAIMING VALIDATION IS COMPLETE:**

1. **COUNT TOTAL CHECKLIST ITEMS**: `Total items: X`
2. **COUNT BY STATUS**: 
   - `Completed [x]: Y`
   - `Pending [ ]: Z`
   - `Skipped [~]: S`
   - `Blocked [!]: B`
3. **VERIFY MATH**: `X = Y + Z + S + B`
4. **CHECK COMPLETION**: `Testable items: X - S = T` (exclude skipped)
5. **IF (Y + B) < T**: CONTINUE VALIDATION - NOT COMPLETE
6. **IF (Y + B) = T**: VALIDATION COMPLETE - ALL TESTABLE ITEMS ADDRESSED

**COMPLETION CRITERIA:**
- COMPLETED + BLOCKED = TESTABLE ITEMS (excluding skipped)
- BLOCKED items are acceptable (cannot be tested due to dependencies)
- PENDING items must be resolved (either completed, blocked, or skipped)

**MANDATORY FINAL VERIFICATION**: Before ending validation, you MUST:
- Show final checklist status: `✅ COMPLETED: Y | BLOCKED: B | SKIPPED: S`
- Confirm zero pending items: `❌ 0 PENDING ITEMS`
- State completion explicitly: `🎯 VALIDATION 100% COMPLETE`

## 🔧 POST-VALIDATION WORKFLOW 🔧

**AFTER COMPLETING VALIDATION:**

1. **SUMMARIZE ISSUES FOUND**: List all functional failures, content inaccuracies, and broken elements
2. **PRESENT ALL ISSUES**: List every issue found during validation
3. **ASK USER FOR NEXT STEPS**:
   - "I found X issues during validation. Would you like me to:"
   - "🔧 Attempt to fix the issues I can address?"
   - "📝 Create a detailed action plan for addressing all issues?"
   - "🚫 Just provide the validation report as-is?"
4. **IF USER WANTS FIXES**: Ask user to specify which issues to fix and how
5. **IF USER WANTS ACTION PLAN**: Create structured plan for addressing all issues

**FIXING APPROACH**:
- **Let user decide** what should be fixed and how
- **Don't assume** what can or cannot be fixed
- **Ask for guidance** on issues that might require different approaches
- **Propose solutions** but let user choose the approach

**POTENTIAL FIX CATEGORIES** (user decides):
- **Documentation edits**: Update text, links, examples, syntax
- **Code changes**: Fix functional bugs, add missing features
- **File operations**: Add missing files, update configurations
- **External coordination**: Report issues to external projects
- **Process changes**: Update workflows, procedures, or tooling

**FIXING WORKFLOW**:
1. **Present issues** to user with proposed solutions
2. **Get user approval** for fixing approach
3. **Implement fixes** as directed by user
4. **Re-validate** fixed items to verify resolution
5. **Update validation report** with fix results

## Sections Validated
✅ **[Section Name]** (lines X-Y) - [Content types found] - [N] issues
❌ **[Section Name]** (lines X-Y) - [Content types found] - SKIPPED ([reason])

## Functional Testing Performed
**Commands Executed:**
- `command1` → Result: [success/failure/output summary]
- `command2` → Result: [success/failure/output summary]

**URLs/APIs Tested:**
- `https://example.com/api` → Result: [response/status]
- `https://docs.example.com` → Result: [accessible/broken]

**Workflows Reproduced:**
- [Workflow name] → Result: [completed successfully/failed at step X]

**Configurations Validated:**
- `config.json` → Result: [valid syntax/parsing error]

## Issues Found

❌ FUNCTIONAL FAILURE

File: [DOCUMENT_NAME]
Section: [Section Name] (line X)
Element: `[specific command/config/element]`
Issue: [Specific problem description]
Tested: [What was actually executed/tested]
Expected: [What documentation claims should happen]
Actual: [What actually happened]
Action: [Specific fix needed]

## Summary
- Sections processed: X/X
- Issues found: X
- **CHECKLIST COMPLETION**:
  - **Total checklist items**: X
  - **Items completed [x]**: Y  
  - **Items pending [ ]**: Z
  - **Items skipped [~]**: S
  - **Items blocked [!]**: B
  - **Testable items**: X - S = T
  - **Completion status**: [IN PROGRESS/COMPLETE]
- Commands tested: X/X successfully executed
- URLs tested: X/X accessible
- Workflows tested: X/X completed
- Status: X sections validated, X skipped

**🛑 VALIDATION STATUS**: 
- ✅ COMPLETE (if all checklist items checked)
- ❌ INCOMPLETE (if any checklist items remain unchecked)
```

**Template Notes:**
- **[DOCUMENT_NAME]**: Replace with actual filename being validated
- **[Section Name]**: Use actual section headers from the document
- **[Content types found]**: List actual content types (commands, configs, workflows, etc.)
- **[N] issues**: Show actual issue count per section
- **Lines X-Y**: Use actual line numbers from the document

**Success Output**: When no issues found, show all sections with ✅ and 0 issues

## Guidelines for Execution

1. **Single-pass processing** - Read and validate simultaneously, no separate planning phase
2. **Section-by-section** - Process each major section completely before moving to next
3. **Announce sections** - Explicitly state "Now validating: [Section Name]" as you process
4. **Track inline** - Write section completion to validation report as you finish each section
5. **Never stop on failures** - Complete entire document validation
6. **Be explicit about skipping** - Clearly state why sections are not validated
7. **Provide actionable feedback** - Tell exactly what's wrong and how to fix it
8. **Use actual validation** - Check files, parse configs, verify command syntax
9. **Focus on user experience** - Validate what users would actually encounter
10. **🛑 MANDATORY CHECKLIST COMPLETION** - You MUST complete every single checklist item before claiming validation is done
11. **🔢 COUNT AND VERIFY** - Always count total vs completed items and show the math
12. **🚫 NO EARLY TERMINATION** - Never stop validation until checklist shows 100% completion

## Notes

- This is a manual process - use your judgment for edge cases
- Focus on actionable validation that improves user experience
- When in doubt, err on the side of skipping rather than false positives
- Consider the target audience and use case when making validation decisions