# Documentation Testing - Scan Phase

You are analyzing documentation to identify all testable content. Your goal is to find every piece of content that can be validated, executed, or verified in any type of documentation.

## File to Analyze
**File**: {filePath}
**Session**: {sessionId}

## Comprehensive Content Discovery

Scan the documentation systematically and identify ALL types of testable content:

### 1. Executable Content
- **Shell commands**: Terminal commands in any shell (bash, zsh, powershell, cmd)
- **Code snippets**: Runnable code in any programming language
- **Scripts**: Batch files, shell scripts, automation scripts
- **CLI invocations**: Command-line tool usage examples
- **Package management**: npm, pip, apt, yum, composer, cargo, etc.
- **Build/deployment commands**: make, gradle, docker, kubectl, etc.
- **Database queries**: SQL, NoSQL, database-specific commands

### 2. Links & References Validation
- **External URLs**: Web links, API endpoints, documentation references
- **Internal file references**: Relative paths, documentation cross-references
- **Repository links**: GitHub, GitLab, Bitbucket URLs
- **Download links**: Software downloads, assets, resources
- **Image references**: Screenshots, diagrams, logos, figures
- **Anchor links**: In-page navigation, table of contents links

### 3. File & Directory Operations
- **File creation**: Instructions to create, edit, or modify files
- **Directory structures**: Path references, folder hierarchies
- **File existence checks**: References to files that should exist
- **Permission operations**: chmod, file ownership changes
- **File downloads**: wget, curl, browser downloads
- **Configuration file paths**: Application configs, system files

### 4. Configuration & Environment
- **Environment variables**: Variables to set or reference
- **Configuration files**: JSON, YAML, TOML, XML, INI structures  
- **System settings**: Registry entries, system preferences
- **Service configurations**: Database connections, API keys, endpoints
- **Runtime parameters**: Command flags, application settings
- **Path configurations**: CLASSPATH, PATH, library paths

### 5. Installation & Prerequisites
- **Software installation**: Package installations, software setup
- **System requirements**: OS versions, hardware requirements
- **Dependency management**: Libraries, frameworks, tools needed
- **Version specifications**: Minimum/maximum version requirements
- **Platform compatibility**: OS-specific instructions
- **Permission requirements**: Admin/root access, user permissions

### 6. Network & Connectivity
- **API endpoints**: REST calls, GraphQL queries, SOAP requests
- **Port configurations**: Service ports, firewall settings
- **Network tests**: ping, telnet, curl connectivity checks
- **Service availability**: Health checks, status endpoints
- **Authentication**: Login procedures, token generation
- **Protocol specifications**: HTTP, HTTPS, FTP, SSH usage

### 7. Interactive Workflows
- **Step-by-step procedures**: Multi-step processes with dependencies
- **User interface interactions**: Button clicks, form submissions, navigation
- **Wizard workflows**: Sequential setup procedures
- **Q&A examples**: Input/output examples with expected responses
- **Troubleshooting flows**: Problem identification and resolution steps
- **Tutorial sequences**: Learning paths with validation points

### 8. Verification & Testing
- **Version checks**: Commands that should return version information
- **Status commands**: System status, service health checks
- **Validation commands**: Configuration validation, syntax checking
- **Test procedures**: Unit tests, integration tests, smoke tests
- **Expected outputs**: Sample outputs, expected results, success indicators
- **Error scenarios**: Expected failures, error handling examples

## Content Classification Strategy

### What TO Include (Testable Content)
- Any instruction that produces a measurable outcome
- References that can be verified to exist or be accessible
- Configurations that can be validated for correctness
- Prerequisites that can be checked for availability
- Workflows that can be executed step-by-step
- Claims that can be fact-checked or demonstrated

### What NOT to Include (Descriptive Content)
- Marketing copy and feature descriptions
- Conceptual explanations without actionable steps
- Background information and context setting
- Pure narrative text without instructions
- Theoretical discussions without practical application
- Acknowledgments, legal text, and metadata

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