# Documentation Testing - Scan Phase

You are analyzing documentation to identify all content that can be validated through testing. Your goal is to find every section containing factual claims, executable instructions, or verifiable information.

## File to Analyze
**File**: {filePath}
**Session**: {sessionId}

## Core Testing Philosophy

**Most technical documentation is testable** through two validation approaches:
1. **Functional Testing**: Execute instructions and verify they work
2. **Factual Verification**: Compare claims against actual system state

## Comprehensive Content Discovery

### 1. Executable & Interactive Content
- **Commands & Scripts**: Shell commands, CLI tools, code snippets, scripts
- **Workflows & Procedures**: Step-by-step instructions, installation guides, setup procedures
- **API & Network Operations**: REST calls, database queries, connectivity tests
- **File & System Operations**: File creation, directory structures, permission changes
- **Configuration Examples**: Config files, environment variables, system settings

### 2. Factual Claims & System State
- **Architecture Descriptions**: System components, interfaces, data flows
- **Implementation Status**: What's implemented vs planned, feature availability
- **File Structure Claims**: File/directory existence, code organization, module descriptions
- **Component Descriptions**: What each part does, how components interact
- **Capability Claims**: Supported features, available commands, system abilities
- **Version & Compatibility Info**: Software versions, platform support, dependencies

### 3. References & Links
- **External URLs**: Web links, API endpoints, documentation references
- **Internal References**: File paths, code references, documentation cross-links
- **Resource References**: Images, downloads, repositories, configuration files

### 4. Examples & Demonstrations
- **Code Examples**: Function usage, API calls, configuration samples
- **Sample Outputs**: Expected results, error messages, status displays
- **Use Case Scenarios**: Workflow examples, integration patterns

## Content Classification Strategy

### What TO Include (Testable Sections)
- **Any factual claim** that can be verified against system state
- **Any instruction** that can be executed or followed
- **Any reference** that can be checked for existence or accessibility
- **Any example** that can be validated for correctness
- **Any workflow** that can be tested end-to-end
- **Any status claim** that can be fact-checked (implemented vs planned)
- **Any architectural description** that can be compared to actual code

### What NOT to Include (Non-Testable Sections)
- **Pure marketing copy** with no factual claims
- **Abstract theory** with no concrete implementation details
- **General philosophy** without specific claims
- **Legal text** (licenses, terms, copyright)
- **Pure acknowledgments** without technical content
- **Speculative future plans** with no current implementation claims

### Examples of Testable vs Non-Testable Content

#### ✅ TESTABLE:
- "The CLI has a `recommend` command" → Can verify command exists
- "Files are stored in `src/core/discovery.ts`" → Can check file exists
- "The system supports Kubernetes CRDs" → Can test CRD discovery
- "Run `npm install` to install dependencies" → Can execute command
- "The API returns JSON format" → Can verify API response format

#### ❌ NON-TESTABLE:
- "This tool helps developers be more productive" → Subjective claim
- "Kubernetes is a container orchestration platform" → General background info
- "We believe in developer-first experiences" → Philosophy statement
- "Thanks to all contributors" → Acknowledgment
- "The future of DevOps is bright" → Speculative statement

## Document Structure Analysis

### Section Identification Process
1. **Find structural markers**: Headers (##, ###, ####), horizontal rules, clear topic boundaries
2. **Identify section purposes**: Installation, Configuration, Usage, Troubleshooting, Examples, etc.
3. **Map content types**: What kinds of testable content exist in each section
4. **Trace dependencies**: Which sections must be completed before others can be tested
5. **Assess completeness**: Are there gaps or missing steps within sections

### Per-Section Analysis
For each identified section, determine:
- **Primary purpose**: What is this section trying to help users accomplish?
- **Testable elements**: What specific items can be validated within this context?
- **Prerequisites**: What must be done first for this section to work?
- **Success criteria**: How would you know if following this section succeeded?
- **Environmental context**: What platform, tools, or setup does this assume?

### Universal Validation Strategy
- **Functional validation**: Do the instructions work as written?
- **Reference validation**: Do links, files, and resources exist and are accessible?
- **Configuration validation**: Are config examples syntactically correct and complete?
- **Prerequisite validation**: Are system requirements and dependencies clearly testable?
- **Outcome validation**: Do procedures achieve their stated goals?

## Output Requirements

Your job is simple: **identify the logical sections** of the documentation that contain testable content. 

### What to Look For:
- Major headings that represent distinct topics or workflows
- Sections that contain instructions, commands, examples, or references  
- Skip purely descriptive sections (marketing copy, background info, acknowledgments)

### What NOT to Analyze:
- Don't inventory specific testable items (that's done later per-section)
- Don't worry about line numbers (they change when docs are edited)
- Don't analyze dependencies (we test sections top-to-bottom in document order)

## Required Output Format

Return a simple JSON array of section titles that should be tested:

```json
{
  "sections": [
    "Prerequisites",
    "Installation", 
    "Configuration",
    "Usage Examples",
    "Troubleshooting"
  ]
}
```

### Guidelines:
- Use the **actual section titles** from the document (or close variations)
- List them in **document order** (top-to-bottom)
- Include only sections that have **actionable/testable content**
- Keep titles **concise but descriptive**
- Aim for **3-8 sections** for most documents

## Instructions

Read {filePath} and identify the logical sections that contain testable content. Return only the simple JSON array of section titles - nothing more.