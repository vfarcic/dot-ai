# PRD: Documentation Validation System - Phase 1

**GitHub Issue**: [#262](https://github.com/vfarcic/dot-ai/issues/262)
**Status**: Draft
**Priority**: High
**Created**: 2025-12-10

## Problem Statement

Documentation drifts from code reality over time. Users follow outdated instructions, code examples don't work, and there's no automated way to detect these issues before users encounter them. This leads to:

- Frustrated users who can't complete tutorials
- Support burden from documentation-related questions
- Loss of trust in project quality
- Maintainer time spent on manual doc reviews

## Solution Overview

Build a documentation validation system (Phase 1) that:

1. **Crawls documentation sites** to discover all pages from an entry URL
2. **Lets users select pages** to validate (single, multiple, or all)
3. **Analyzes readability** using AI to identify unclear or confusing text
4. **Extracts and validates code blocks** for syntax correctness
5. **Generates actionable reports** listing what needs to be fixed

### What Phase 1 Does NOT Include
- Code block execution (Phase 2)
- Output validation against expected results (Phase 2)
- UI instruction validation like "click that button" (Phase 3)
- Semantic code-to-docs matching (Phase 3)

## User Journey

### Primary Flow

1. **User initiates validation** via MCP client (e.g., Claude Code):
   ```
   User: "Test docs at https://docs.example.com"
   ```

2. **System crawls and discovers pages**:
   ```
   Found 47 documentation pages:

   1. Getting Started (/)
   2. Installation (/install)
   3. Quick Start (/quickstart)
   4. Configuration (/config)
   ...

   Which pages would you like to validate?
   - Enter page numbers (e.g., "1,3,5" or "1-10")
   - Enter "all" for all pages
   ```

3. **User selects pages**:
   ```
   User: "1-5, 12"
   ```

4. **System validates each page sequentially**:
   - Fetches page content
   - Checks for prerequisite links (handles dependencies)
   - Analyzes readability
   - Extracts code blocks
   - Validates syntax per language

5. **System generates report**:
   ```
   ## Documentation Validation Report

   ### /quickstart

   **Readability Issues (2)**:
   - Line 45: Sentence is 78 words long. Consider breaking into smaller sentences.
   - Line 112: Passive voice makes instruction unclear. Suggest: "Run the command" instead of "The command should be run"

   **Code Block Issues (1)**:
   - Lines 67-72 (JavaScript): SyntaxError - Unexpected token at line 3
     ```javascript
     const config = {
       name: "test"
       port: 3000  // Missing comma
     }
     ```

   ### /config

   **Readability Issues (0)**: None found
   **Code Block Issues (0)**: None found

   ---
   **Summary**: 6 pages validated, 3 issues found (2 readability, 1 syntax)
   ```

### Alternative Flow: Local Markdown Docs

```
User: "Test docs in ./docs folder"
```

System discovers markdown files locally instead of crawling a URL.

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Tool: testDocs                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │   Crawler    │───▶│  Page Store  │───▶│  Selector  │ │
│  │  (URL/Local) │    │  (in-memory) │    │    UI      │ │
│  └──────────────┘    └──────────────┘    └────────────┘ │
│                                                │         │
│                                                ▼         │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │   Report     │◀───│   Analyzer   │◀───│  Fetcher   │ │
│  │  Generator   │    │  (AI + Lint) │    │            │ │
│  └──────────────┘    └──────────────┘    └────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Components

#### 1. Documentation Crawler
- **URL Mode**: Fetches sitemap.xml first, falls back to link crawling
- **Local Mode**: Glob pattern matching for `.md`, `.mdx` files
- **Output**: List of page URLs/paths with titles

#### 2. Page Selector
- Interactive selection via MCP tool responses
- Supports ranges (1-10), individual (1,3,5), and "all"
- Remembers selection for re-runs

#### 3. Content Fetcher
- Retrieves page content (HTML or Markdown)
- Parses prerequisite links (e.g., "Before continuing, complete [Setup](/setup)")
- Extracts:
  - Plain text content
  - Code blocks with language tags
  - Links to other doc pages

#### 4. Readability Analyzer
- AI-powered analysis for:
  - Sentence complexity and length
  - Passive voice in instructions
  - Ambiguous pronouns ("it", "this" without clear reference)
  - Missing context or assumed knowledge
  - Inconsistent terminology

#### 5. Code Block Validator
- Extracts code blocks with language identifiers
- Validates syntax using language-specific parsers:
  - JavaScript/TypeScript: esbuild or typescript compiler
  - Python: ast.parse()
  - Go: go fmt / go vet (syntax only)
  - YAML: yaml parser
  - JSON: JSON.parse()
  - Bash: bash -n (syntax check)
- Reports line numbers within the code block

#### 6. Report Generator
- Structured output (Markdown or JSON)
- Grouped by page
- Actionable suggestions for each issue
- Summary statistics

### MCP Tool Interface

```typescript
interface TestDocsParams {
  // Discovery stage
  source?: string;          // URL or local path

  // Selection stage (after discovery)
  sessionId?: string;       // Continue previous session
  selectedPages?: string;   // "1,3,5" or "1-10" or "all"

  // Validation stage
  validateNext?: boolean;   // Validate next selected page

  // Report stage
  getReport?: boolean;      // Get final report
}

interface TestDocsResponse {
  stage: 'discovery' | 'selection' | 'validating' | 'complete';

  // Discovery stage
  pages?: Array<{
    index: number;
    path: string;
    title: string;
  }>;

  // Validation stage
  currentPage?: string;
  progress?: string;        // "3/6 pages"
  issues?: Issue[];

  // Complete stage
  report?: ValidationReport;
}
```

### Prerequisite Handling

When a page references prerequisites:

1. **Detection**: Parse for patterns like:
   - "Before you begin, complete [X](/path)"
   - "Prerequisites: [Setup Guide](/setup)"
   - "This guide assumes you've completed [Installation](/install)"

2. **User Prompt**:
   ```
   Page "/advanced-config" references prerequisite: "/basic-config"

   Options:
   1. Validate prerequisite first (recommended)
   2. Skip prerequisite, validate this page only
   3. Skip this page entirely
   ```

3. **Dependency Tracking**: Avoid circular dependencies, track validated pages

## Success Criteria

### Functional Requirements
- [ ] Crawl Docusaurus sites and discover all pages
- [ ] Crawl GitHub markdown repositories
- [ ] Support page selection (individual, ranges, all)
- [ ] Analyze readability with AI and provide specific suggestions
- [ ] Extract code blocks with correct language identification
- [ ] Validate syntax for: JavaScript, TypeScript, Python, Go, YAML, JSON, Bash
- [ ] Handle prerequisite page references
- [ ] Generate actionable Markdown report

### Non-Functional Requirements
- [ ] Complete validation of 10 pages in under 2 minutes
- [ ] Work offline for local markdown docs (except AI readability)
- [ ] No false positives on valid syntax
- [ ] Clear error messages when validation fails

## Milestones

### Milestone 1: Documentation Crawling
- [ ] Implement URL-based crawler (sitemap + link following)
- [ ] Implement local file discovery (glob patterns)
- [ ] Create page listing with titles and paths
- [ ] Handle Docusaurus-specific structure

### Milestone 2: Page Selection & Fetching
- [ ] Interactive page selection via MCP
- [ ] Session management for multi-step workflow
- [ ] Content fetching and parsing (HTML to text)
- [ ] Code block extraction with language detection

### Milestone 3: Readability Analysis
- [ ] AI-powered readability analysis
- [ ] Specific, actionable suggestions
- [ ] Configurable strictness levels

### Milestone 4: Code Syntax Validation
- [ ] Language-specific syntax validators
- [ ] Accurate line number reporting
- [ ] Support for at least 6 languages (JS, TS, Python, Go, YAML, JSON, Bash)

### Milestone 5: Prerequisite Handling
- [ ] Prerequisite link detection
- [ ] User prompting for dependency resolution
- [ ] Circular dependency prevention

### Milestone 6: Report Generation & Polish
- [ ] Markdown report format
- [ ] Summary statistics
- [ ] Integration testing with real documentation sites
- [ ] Documentation for the feature itself

### Milestone 7: Phase 2 PRD Creation
- [ ] Evaluate Phase 1 results and gather user feedback
- [ ] Create Phase 2 PRD (Code Execution in Containers)
- [ ] Document scope adjustments based on Phase 1 lessons learned

## Future Phases

### Phase 2: Code Execution
- Execute code blocks in sandboxed containers
- Validate outputs against expected results
- Handle stateful code sequences
- Multi-language runtime support

### Phase 3: UI & Semantic Validation
- Browser automation for "click that button" instructions
- Semantic matching between code behavior and documentation claims
- Screenshot comparison for UI docs

## Open Questions

1. **Rate Limiting**: Should we implement rate limiting for external URL fetching?
2. **Caching**: Should we cache fetched pages for re-runs?
3. **Authentication**: How to handle docs behind authentication?
4. **Custom Validators**: Should users be able to add custom syntax validators?

## Dependencies

- None (this is foundational work)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sitemap not available | Medium | Low | Fall back to link crawling |
| AI readability analysis too slow | Medium | Medium | Batch analysis, parallel processing |
| Code block language misidentified | Medium | Medium | Allow manual override, use file context |
| Prerequisite detection false positives | Low | Low | User confirmation before following |

*This PRD covers Phase 1 only. Phase 2 (Code Execution) and Phase 3 (UI Validation) will be separate PRDs.*
