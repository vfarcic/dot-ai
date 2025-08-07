# Documentation Testing - Section Test Phase (Functional + Semantic)

You are testing a specific section of documentation to validate both functionality AND accuracy. You must verify that instructions work AND that the documentation text truthfully describes what actually happens.

**Important**: 
- Skip content that has ignore comments containing "dotai-ignore" (e.g., `<!-- dotai-ignore -->`, `.. dotai-ignore`, `// dotai-ignore`). Do not generate issues or recommendations for ignored content.
- Look for testing hints in comments containing "dotai-test-hint" (e.g., `<!-- dotai-test-hint: use mcp__dot-ai__prompts to verify slash commands -->`, `.. dotai-test-hint: run command X to test claim Y`, `// dotai-test-hint: check actual behavior with tool Z`). Follow these hints when testing the associated content.

## CRITICAL MINDSET: User Behavior Simulation

**You are simulating a real user following this documentation step-by-step.**

### User Journey Testing Requirements

**Follow documented workflows exactly as users would:**
- If docs say "Run this command to test" → Actually execute that command and verify it works
- If docs say "Navigate to Settings page" → Verify that page/option exists and is accessible  
- If docs say "You should see output X" → Confirm you actually get output X
- If docs say "Click the Install button" → Verify that button exists and functions
- If docs say "This will automatically happen" → Test that it actually happens automatically

**Key User Scenarios to Simulate:**
1. **Frustrated troubleshooting user** → Would run every suggested diagnostic command to find the problem
2. **New setup user** → Would expect every installation/configuration step to work as written
3. **Verification user** → Would run confirmation commands to ensure their setup is working
4. **Integration user** → Would follow workflow examples expecting them to produce stated results

**Critical Testing Mindset Shifts:**
- **From**: "This looks like an example command" → **To**: "A user would actually run this - does it work?"
- **From**: "The JSON syntax is valid" → **To**: "If a user creates this config, does it actually work?"
- **From**: "This seems reasonable" → **To**: "If I follow these exact steps, do I get the promised outcome?"

## Section to Test
**File**: {filePath}
**Session**: {sessionId}
**Section**: {sectionTitle} (ID: {sectionId})
**Progress**: {sectionsRemaining} of {totalSections} sections remaining after this one

## Your Task - Two-Phase Validation

### Phase 1: Execute and Test (Functional Validation)
Execute everything testable as a real user would:
- Follow step-by-step instructions exactly as written
- Execute commands, code examples, procedures (adapt for safety: use `./tmp/` for file operations, test endpoints for URLs, etc.)
- Test interactive elements and verify file operations work
- Validate that examples produce expected results

### Phase 2: Analyze Claims vs Reality (Semantic Validation)  
Check every claim in the documentation:
□ **Difficulty/Time Claims**: Does "easy," "simple," "quickly," "automatically" match reality?
□ **Outcome Claims**: Do "you will see," "this enables," "results in" match what actually happens?
□ **Prerequisite Claims**: Are stated requirements actually sufficient for success?
□ **User Experience Claims**: Would a typical user get the promised experience?
□ **Feature Claims**: Are described capabilities actually implemented in the codebase?
□ **Architecture Claims**: Do system descriptions match actual implementation?
□ **Integration Claims**: Do components actually work together as described?
□ **Status Claims**: Are features marked as "available" actually working vs. "planned"?

### Additional Validation (When Applicable)
**Cross-File Terminology**: If testing documentation that references related files, check for terminology consistency (same concepts using identical terms across files).

**Code Claims**: When documentation makes claims about code, files, or system architecture, validate them against the actual codebase using available tools (Grep, Read, Task, etc.).

## Testing Approach

### EXECUTION REQUIREMENTS FOR TESTABLE CONTENT
**When documentation contains executable examples, you MUST actually execute them:**

**Types of executable content that require actual testing:**
- **CLI Commands**: `kubectl get pods`, `npm install`, `docker run`
- **API Calls**: HTTP requests, REST endpoints, GraphQL queries
- **MCP Tool Calls**: `mcp__tool_name` with documented parameters
- **Configuration Examples**: Creating files, environment variables, config files
- **Web Navigation**: URLs, web interface interactions, form submissions
- **Database Queries**: SQL commands, database operations
- **Script Execution**: Shell scripts, Python scripts, automation workflows

**Testing Protocol for Executable Content:**
✅ REQUIRED: Execute each example exactly as documented
✅ REQUIRED: Test with the exact parameters/inputs shown  
✅ REQUIRED: Compare actual results with documented expected results
❌ FORBIDDEN: Analyze implementation code instead of running examples
❌ FORBIDDEN: Skip execution because "it looks similar to previous tests"
❌ FORBIDDEN: Rely on testing from other sections of the documentation

### NON-TESTABLE CONTENT (Testing Not Required)
**These types of content should be analyzed but not executed:**
- **Conceptual explanations**: Architecture descriptions, background theory
- **Screenshots**: Visual examples that can't be directly executed
- **Future roadmaps**: Planned features not yet implemented
- **External dependencies**: Third-party services you don't control
- **Destructive operations**: Commands that could damage systems
- **Hardware-specific instructions**: When you lack the specific hardware
- **Security credentials**: Examples containing sensitive information

### CRITICAL: Section-Specific Testing Required (When Testable)
**Each documentation section with executable content requires independent validation:**
- Execute the specific testable examples shown in the current section
- Previous successful tests cannot substitute for current section validation
- Clearly distinguish between testable and non-testable content in your analysis

### Functional Testing (Execute Documentation)
**Execute documented examples first** - Always prioritize running the actual commands/procedures shown in the documentation, adapting for safety when needed. Use help commands only as supplements for understanding, not as substitutes for real testing.

### Claim Validation (Verify Descriptions)
**For architectural/system claims**: Use Grep/Read tools to find relevant code and verify claims about system behavior, component relationships, and implementation details.

**For feature availability claims**: Search codebase for actual implementations of described features. Distinguish between implemented functionality and planned/aspirational descriptions.

**For integration claims**: Test that described component interactions actually work as documented, not just that individual components exist.

**For file/directory claims**: Verify that referenced files, directories, and code structures actually exist and contain what's described.

**Before submitting results:**
- "If I were a real user following these docs, where would I get stuck?"
- "Did I test the actual user workflows, not just validate syntax?"
- "Would a user following these steps get the experience the docs promise?"

## Result Format

Return your results as JSON in this exact format:

```json
{
  "whatWasDone": "Brief summary of what you tested and executed in this section",
  "issues": [
    "Specific problem or issue you found while testing",
    "Another issue that prevents users from succeeding"
  ],
  "recommendations": [
    "Specific actionable suggestion to fix an issue",
    "Improvement that would help users succeed"
  ]
}
```

**Guidelines:**

**whatWasDone** (string): Concise summary covering BOTH functional testing AND semantic analysis - what commands/procedures you executed and what claims you analyzed.

**issues** (array): CRITICAL PROBLEMS that prevent users from succeeding (broken functionality, incorrect information, missing required steps). Include precise location and explain user impact. Each issue must be ACTIONABLE - describe what needs to be changed/fixed.

**recommendations** (array): OPTIONAL IMPROVEMENTS that would enhance user experience (NOT critical problems). Must be genuinely optional - user can succeed without these changes. Each recommendation must be ACTIONABLE - describe a specific change to make. Do NOT include statements that validate existing content is correct (e.g., "The format matches actual behavior - this is accurate"). Only include suggestions for actual changes or additions. Do NOT repeat anything from issues array.

**ACTIONABILITY REQUIREMENT**: Both issues and recommendations must suggest concrete changes. Avoid validation statements like "X is correct" or "Y matches expected behavior." If something is working correctly, don't mention it unless suggesting an enhancement.

**ANTI-DUPLICATION RULES**: If something is broken/incorrect → issues only. If something could be enhanced but works fine → recommendations only. Never put the same concept in both arrays.

## Instructions

Complete BOTH phases for comprehensive testing:

### Phase 1 Execution Checklist:
1. Identify all testable content - discover commands, procedures, examples
2. Execute everything - run commands, test procedures, verify examples  
3. Document what actually happens - capture real outcomes vs expected

### Phase 2 Analysis Checklist:  
1. Find all claims - scan text for promises, expectations, descriptions
2. Evaluate each claim - does reality match what's written?
3. Check user perspective - would a typical user get the promised experience?

Both phases are mandatory - functional testing without semantic analysis misses critical user experience gaps. Your goal is ensuring users get both working instructions AND accurate expectations about what will actually happen.