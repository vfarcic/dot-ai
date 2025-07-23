# Documentation Testing - Section Test Phase (Functional + Semantic)

You are testing a specific section of documentation to validate both functionality AND accuracy. You must verify that instructions work AND that the documentation text truthfully describes what actually happens.

**Important**: Skip content that has ignore comments containing "dotai-ignore" (e.g., `<!-- dotai-ignore -->`, `.. dotai-ignore`, `// dotai-ignore`). Do not generate issues or recommendations for ignored content.

## Section to Test
**File**: {filePath}
**Session**: {sessionId}
**Section**: {sectionTitle} (ID: {sectionId})
**Progress**: {sectionsRemaining} of {totalSections} sections remaining after this one

## Your Task - Two-Phase Validation

### Phase 1: Execute and Test (Functional Validation)
**Goal**: Verify that instructions, examples, and procedures actually work

Execute everything testable in this section:
- Follow step-by-step instructions exactly as written
- Execute commands, code examples, or procedures
- Test interactive elements (buttons, forms, interfaces)
- Verify file operations, downloads, installations
- Check that prerequisites are sufficient
- Validate that examples produce expected results

### Phase 2: Analyze Claims vs Reality (Semantic Validation)  
**Goal**: Verify that the documentation text truthfully describes what actually happens

**MANDATORY SEMANTIC ANALYSIS** - Check every claim in the documentation:

□ **Difficulty Claims**: Does "easy," "simple," "straightforward" match actual complexity?
□ **Automation Claims**: Does "automatically," "seamlessly," "instantly" match real behavior?  
□ **Outcome Claims**: Do "you will see," "this enables," "results in" match what actually happens?
□ **Time Claims**: Do "quickly," "immediately," "in seconds" match actual duration?
□ **Prerequisite Claims**: Are stated requirements actually sufficient for success?
□ **Success Claims**: Do "successful," "working," "ready" match actual end states?
□ **User Experience Claims**: Would a typical user get the promised experience?
□ **Code/Architecture Claims**: When documentation makes claims about code, files, or system architecture, validate them against the actual codebase

### Cross-File Terminology Validation (When Applicable)

**When testing documentation that references related files**, validate terminology consistency:

#### Terminology Consistency Check
**For files that are part of a documentation set** (e.g., setup guides, user guides, API references):

1. **Identify Key Terms**: Extract important technical terms, feature names, and concepts from current section
2. **Find Related Files**: Identify documentation files that should use consistent terminology
3. **Cross-Reference Validation**: Check if the same concepts use identical terms across files
4. **Flag Inconsistencies**: Report terminology mismatches that could confuse users

**Common Terminology Issues:**
- Same feature called different names in different files
- Inconsistent capitalization (e.g., "MCP Server" vs "mcp server") 
- Different terms for same concept (e.g., "slash commands" vs "command shortcuts")
- Inconsistent format examples (e.g., `/dot-ai:name` vs `/mcp.dot-ai.name`)

**How to Perform Cross-File Validation:**
1. **Extract key terms** from current section being tested
2. **Read related documentation files** mentioned in cross-references or logically related
3. **Compare terminology usage** across files for consistency
4. **Report discrepancies** that would confuse users navigating between files

### Code Analysis Validation (When Applicable)

**When testing technical documentation in a code repository**, perform BOTH directions of validation:

#### 1. Validate Documented Claims Against Code
**File & Directory Claims:**
- Check if claimed file paths actually exist (e.g., "src/core/discovery.ts")
- Verify directory structure matches documentation claims
- Validate that referenced configuration files exist where claimed

**Component & Feature Claims:**
- For architecture docs claiming "System has components A, B, C" - read the actual source code
- Check if documented components/classes/functions actually exist in the codebase
- Verify CLI commands exist if documentation claims they're available

**Implementation Status Claims:**
- For status markers (✅ IMPLEMENTED, 🔴 PLANNED) - verify against actual code
- Check if "planned" features are already implemented but not updated in docs

#### 2. Find Missing Documentation (Reverse Analysis)
**Scan codebase to identify undocumented features:**
- Read key source directories (src/, lib/, bin/, tools/) to find major components
- Check package.json, CLI entry points, and main modules for implemented features
- Look for significant classes, services, interfaces, or tools not mentioned in documentation
- Identify recently added features that may not be reflected in architecture docs

**For architecture/system documentation specifically:**
- Compare documented system components against actual code organization
- Look for major implemented subsystems missing from architecture diagrams
- Check if all main interfaces/entry points are documented

**How to Perform Code Analysis:**
1. **Forward validation**: For each documented claim, verify against actual code
2. **Reverse validation**: Scan actual code to find major features missing from docs
3. Use file reading tools to examine source code structure
4. Focus on major components that users would need to know about
5. Don't flag internal implementation details - focus on user-facing or architecturally significant features

**For each code-related validation, ask:**
- Does this documented claim match the actual code?
- Are there major implemented features missing from this documentation section?
- Would a developer/user be surprised by significant undocumented functionality?

## Universal Testing Approach

### Content Discovery
Look for any testable content in this section:
- **Commands/Scripts**: Terminal commands, code snippets, shell scripts
- **Interactive Steps**: Click buttons, fill forms, navigate interfaces  
- **File Operations**: Create, modify, download, upload files
- **Web Interactions**: Visit URLs, test API endpoints, verify web content
- **Installation Procedures**: Software setup, dependency installation
- **Configuration Steps**: Settings, environment setup, account creation
- **Verification Steps**: Commands or actions that check if something worked
- **Code Examples**: Runnable code that should produce specific outputs
- **Troubleshooting**: Problem-solution pairs that can be validated

### Universal Functional Testing
For any instruction found:
1. **Execute with adaptation** - Modify the steps to work safely in your current environment
2. **Verify actual outcomes** - Confirm the steps produce the described results
3. **Complete missing context** - Add authentication, permissions, dependencies, or setup as needed
4. **Test in safe isolation** - Use temporary directories, test accounts, or sandboxed environments
5. **Validate end-to-end** - Ensure the full workflow achieves its stated purpose

### Universal Semantic Validation
For every claim or description:
1. **Accuracy**: Is the statement factually correct?
2. **Completeness**: Are there undocumented requirements or side effects?
3. **Precision**: Do vague terms like "automatically," "easily," "quickly" match reality?
4. **Outcome matching**: Do results match what's promised?
5. **User expectations**: Would following this meet the set expectations?

## Validation Patterns

### Pattern 1: Command/Code Claims
**Documentation Pattern**: "Run X to do Y"
- **Functional**: Execute command X (adapting for your environment) - does it run without errors?
- **Semantic**: Does executing command X actually accomplish Y as described?

### Pattern 2: Step-by-Step Procedures  
**Documentation Pattern**: "Follow these steps to achieve Z"
- **Functional**: Execute each step (adapting commands/actions for your environment)
- **Semantic**: Do the executed steps actually lead to achieving Z as described?

### Pattern 3: Interactive Instructions
**Documentation Pattern**: "Click A, then B will happen"
- **Functional**: Perform the interaction (click, form submission, navigation, etc.)
- **Semantic**: Does performing the action actually cause B to happen as claimed?

### Pattern 4: Expected Outputs
**Documentation Pattern**: "You should see output like: [example]"
- **Functional**: Execute the process and capture actual output
- **Semantic**: Does the actual output match the documented example (accounting for environment differences)?

### Pattern 5: Capability Claims
**Documentation Pattern**: "This feature enables you to X"
- **Functional**: Use the feature to perform the claimed capability
- **Semantic**: Does using the feature actually enable X as claimed?

## Execution Guidelines

**PRIMARY GOAL**: Test what users will actually do when following the documentation.

**MANDATORY TESTING APPROACH:**
1. **Execute documented examples first** - Always prioritize running the actual commands/procedures shown in the documentation
2. **Use help commands as supplements** - Help commands (`--help`, `man`, `info`) are valuable for understanding syntax or troubleshooting, but should not replace testing documented workflows
3. **Test real user workflows** - Focus on the actual commands and procedures users are instructed to follow

**Examples of correct approach:**
- If docs show `npm start` → Execute `npm start` (primary), use `npm --help` if needed for context
- If docs show `make install PREFIX=/usr/local` → Execute this command (primary), use `make --help` if syntax is unclear
- If docs show `./configure --enable-feature` → Execute this command (primary), check `./configure --help` if it fails
- If docs show `pip install -r requirements.txt` → Execute this command (primary), use `pip --help` for troubleshooting

**The key principle**: Test the documented workflows that users will actually follow, using help commands as tools for understanding rather than as substitutes for real testing.
- **Execute with adaptation**: Modify commands/procedures to work safely in your environment
  - `npm install -g tool` → `npm install tool` (avoid global installs)
  - `curl api.prod.com/endpoint` → `curl httpbin.org/get` (use test endpoints)
  - `mkdir /usr/local/app` → `mkdir ./tmp/test-app` (use local tmp directory)
  - `cd /path/to/project` → `cd ./tmp/project` (work in local tmp directory)
- **Create safe contexts**: Use `./tmp/` directory for all file operations and temporary work
- **Complete incomplete examples**: Add missing parameters, authentication, or setup steps
  - `curl api.example.com` → `curl -H "Accept: application/json" httpbin.org/json`
  - `docker run image` → `docker run --rm -it image` (ensure cleanup)
  - `touch important-file` → `mkdir -p ./tmp && touch ./tmp/important-file` (create in tmp)
- **Verify actual behavior**: Don't just check syntax - confirm the described outcomes occur
- **Adapt destructive operations**: Transform dangerous commands into safe equivalents
  - `rm -rf /data` → `rm -rf ./tmp/test-data` (use local tmp directory)
  - `sudo systemctl restart service` → `echo "Would restart service"` (simulate when necessary)
  - Any file creation/modification → redirect to `./tmp/` directory
- **Document adaptations**: Explain how you modified examples to make them testable

## Result Format

Return your results as JSON in this exact format:

```json
{
  "whatWasDone": "Brief summary of what you tested and executed in this section",
  "issues": [
    "Specific problem or issue you found while testing",
    "Another issue that prevents users from succeeding",
    "Documentation inaccuracy or missing information"
  ],
  "recommendations": [
    "Specific actionable suggestion to fix an issue",
    "Improvement that would help users succeed", 
    "Way to make documentation more accurate"
  ]
}
```

**Guidelines for each field:**

**whatWasDone** (string):
- Concise summary covering BOTH functional testing AND semantic analysis
- Include what commands/procedures you executed (Phase 1)
- Include what claims you analyzed (Phase 2)
- Mention how many items you tested in both phases
- Example: "Tested 4 installation commands - npm install, API key setup, and 2 verification commands. All executed successfully with minor adaptations. Analyzed 6 documentation claims including 'easy installation' and 'automatic verification' - found installation complexity matches claimed simplicity but verification requires manual interpretation."

**Common Requirements for Both Issues and Recommendations:**
- **MUST include precise location**: Section headings, specific text snippets, or element descriptions (NOT line numbers)
- **MUST be immediately actionable**: Clear enough for someone else to locate and address
- Be specific and actionable items only
- Do NOT include positive assessments like "section works well" or "documentation is accurate"
- Use empty arrays if nothing to report
- Keep each item concise but clear
- Focus on user impact and success

**issues** (array of strings):
- **Purpose**: Specific problems that prevent or hinder user success
- **Include**: Both functional problems (doesn't work) and semantic problems (inaccurate descriptions)
- **Must explain user impact**: What fails or misleads users
- Examples: 
  - "In 'Quick Start' section: npm install command requires global flag but documentation doesn't mention it"
  - "Under 'Verification' heading: Expected output 'Success: Ready' but actual output shows 'Status: OK'"
  - "The phrase 'automatically detects' in Prerequisites: Claims automatic detection but requires manual configuration file editing"

**recommendations** (array of strings):
- **Purpose**: Specific actionable improvements that would help users succeed
- **Include**: Only concrete changes or additions to the documentation
- **Must specify exact action**: What text to add, remove, or modify
- Examples:
  - "In 'Quick Start' section: Change 'npm install' command to 'npm install --global'"
  - "Under 'Verification' heading: Update expected output example from 'Success: Ready' to 'Status: OK'"
  - "In Prerequisites section: Add note after 'automatically detects' phrase: 'Requires manual editing of config.json file before detection works'"

**Important**: 
- Use only this JSON format - do not include additional text before or after
- Arrays can be empty if no issues or recommendations found
- Keep strings concise but informative
- Focus on user impact rather than technical details

## Instructions

**CRITICAL**: You must complete BOTH phases for comprehensive testing:

### Phase 1 Execution Checklist:
1. **Identify all testable content** - discover commands, procedures, examples
2. **Execute everything** - run commands, test procedures, verify examples
3. **Document what actually happens** - capture real outcomes vs expected

### Phase 2 Analysis Checklist:  
1. **Find all claims** - scan text for promises, expectations, descriptions
2. **Evaluate each claim** - does reality match what's written?
3. **Check user perspective** - would a typical user get the promised experience?

**Both phases are mandatory** - functional testing without semantic analysis misses critical user experience gaps. Your goal is ensuring users get both working instructions AND accurate expectations about what will actually happen.