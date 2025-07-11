# Test Documentation

Validate documentation against actual code implementation to detect content drift, outdated information, and inconsistencies.

**CONTINUOUS VALIDATION**: Processes entire document, proposing fixes for issues found. User controls whether to apply fixes via normal file edit approval system.

## Usage

```
/test-docs [file-path]
```

If no file path is provided, tests README.md by default.

## Validation Philosophy

**Documentation Drift Detection**: Ensures documentation accurately reflects current reality by comparing claims against actual implementation.

**Three-Layer Validation:**
1. **Structural**: File existence, syntax correctness, link validity
2. **Semantic**: Content accuracy against code/system implementation  
3. **Consistency**: Cross-document consistency and logical coherence

## Assumptions

- **Working environment**: Assumes development environment is set up and functional
- **Skip setup sections**: Does not validate installation procedures or environment setup  
- **Focus on active usage**: Validates commands, workflows, and claims users would encounter

## Validation Categories

### ✅ Always Validate:

#### Structural Validation
- **File paths and links**: Existence, accessibility, correct paths
- **Configuration syntax**: JSON/YAML parsing, schema validation
- **Command syntax**: Well-formed commands, valid flags/options

#### Semantic Validation (Code vs Documentation)
- **Command execution**: Documented commands vs actual behavior when run
- **Configuration examples**: Documented configs vs actual parsing/validation
- **Code examples**: Syntax correctness and functional accuracy
- **Version claims**: Documented versions vs actual requirements/availability
- **Feature descriptions**: Documented capabilities vs verifiable implementation

#### Cross-Reference Validation
- **Internal links**: Documentation cross-references and consistency
- **Version consistency**: Version claims across multiple documentation sources
- **Content accuracy**: Claims that can be verified against actual system behavior

### ❌ Never Validate:
- **Marketing/positioning statements**
  - "Who is this for?" sections
  - Feature benefit claims
  - Competitive advantages
- **Feature descriptions without concrete examples**
  - High-level capability descriptions
  - Abstract feature lists
  - Aspirational language
- **"Coming Soon" or aspirational content**
  - Future roadmap items
  - Planned features
  - Tentative capabilities
- **Simulated conversations or examples**
  - Mock user interactions
  - Example dialogues
  - Hypothetical scenarios
- **Subjective claims**
  - "easy", "powerful", "intuitive"
  - Performance claims without benchmarks
  - User experience assertions

### 🤔 Context-Dependent (Validate with Caution):
- **Troubleshooting solutions**
  - ✅ Validate: Command syntax and availability
  - ❌ Don't validate: Whether they actually solve the problem
- **Workflow examples**
  - ✅ Validate: Command syntax and sequence logic
  - ❌ Don't validate: End-to-end functional outcomes
- **Documentation links**
  - ✅ Validate: File existence and accessibility
  - ❌ Don't validate: Accuracy of link descriptions

## Validation Process

### 1. Sequential Validation
- Start from the top of the document
- Process each section in order
- Continue through entire document, addressing issues as found
- User controls continuation via file edit approval system

### 2. Issue Types
- **File/Link missing**: Referenced file or link doesn't exist
- **Command doesn't work**: Documented command fails when executed
- **Configuration invalid**: Syntax errors or schema violations in configuration examples
- **Functional mismatch**: Command/code works but produces different output than described
- **Version mismatch**: Documented versions don't match actual requirements/availability
- **Content inaccuracy**: Documented claims don't match verifiable reality

### 3. Validation Standards
- **Execute, don't just analyze**: Actually run commands rather than just checking code
- **Functional over comprehensive**: If documented command works, it's valid (even if other options exist)
- **User experience focus**: Test what users would actually encounter, not internal implementation details

### 4. Validation Actions
- **File/Link checks**: Use file system or HTTP requests to verify existence
- **Command execution**: Run documented commands to verify they work
- **Workflow validation**: Execute documented command sequences, adapting to actual outputs
- **Configuration parsing**: Parse configuration files and validate syntax/structure
- **Output verification**: Compare actual results with documented expectations
- **Cross-reference checks**: Verify consistency across multiple documentation sources
- **Implementation verification**: Check documented claims against actual code/system behavior

### 4.1 Workflow Validation
- **Identify command sequences**: Detect multi-step workflows in documentation
- **Execute sequentially**: Run commands in documented order
- **Adapt to outputs**: Use actual results from previous commands (e.g., real solution IDs)
- **Validate flow**: Ensure each step works with previous step's output
- **Test user experience**: Verify documented workflows actually work end-to-end

### 4.2 Execution Environment
- **Separate session validation**: Run commands in isolated context without current development setup
- **Clean environment**: Test what users would actually experience, not just what works in development
- **User simulation**: Execute commands as if following documentation for the first time

### 4.3 Issue Resolution
- **Detect and explain**: Identify specific problems with clear reasoning
- **Propose and attempt fix**: Directly attempt the fix without asking permission
- **Use existing approval system**: Let normal file edit approval handle user consent
- **Continue validation**: Proceed to next issue regardless of approval result

### 5. Output Format


**During Validation**: Report each issue found with explanation and proposed fix
**On Completion**: Summary of issues found and actions taken

```
❌ VALIDATION FAILED

File: README.md
Section: Installation (line 36)
Element: `npm install -g @vfarcic/nonexistent-package`
Issue: Package '@vfarcic/nonexistent-package' does not exist on npm registry
Action: Fix package name or verify publication status
```


## Success Output

```
✅ DOCUMENTATION VALIDATED

File: README.md
Validated: 12 elements (commands, files, configurations)
Skipped: 8 sections (marketing content, feature descriptions)
Status: All validatable elements passed
```

## Guidelines for Execution

1. **Start at the top** - Process document sequentially from beginning
2. **Stop on first failure** - Do not continue past invalid elements
3. **Be explicit about skipping** - Clearly state why sections are not validated
4. **Provide actionable feedback** - Tell exactly what's wrong and how to fix it
5. **Use actual validation** - Check files, parse configs, verify command syntax
6. **Focus on user experience** - Validate what users would actually encounter

## Notes

- This is a manual process - use your judgment for edge cases
- Focus on actionable validation that improves user experience
- When in doubt, err on the side of skipping rather than false positives
- Consider the target audience and use case when making validation decisions