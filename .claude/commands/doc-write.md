---
description: Write or update documentation with validated examples using execute-then-document workflow
---

# Documentation Writing Workflow

Write documentation with real, validated examples by executing commands and capturing actual outputs.

## Workflow Overview

1. **Phase 1: Setup Validation** - You set up the project following quickstart/setup docs, fixing any issues found
2. **Phase 2: Documentation Task** - Update existing guide or create new one with validated examples
3. **Phase 3: Cleanup** - Tear down test infrastructure when complete

## Phase 1: Setup Validation

**MANDATORY: You must complete this phase before ANY documentation work. Do not skip to Phase 2.**

**Purpose**: Validate the quickstart and setup docs are accurate while preparing the environment.

**Key Rule**: You execute ALL setup commands using the Bash tool. The user only executes examples that will appear in the final documentation.

### Step 1.1: Identify Setup Documentation

Locate the project's **user-facing** setup documentation:
- Look for `docs/quick-start.md`, `docs/setup/`, `README.md`, or similar
- Identify the recommended setup method for documentation work
- **IMPORTANT**: Follow only user-facing docs, not internal test infrastructure or developer scripts (unless the user-facing docs explicitly reference them)

### Step 1.2: Execute Setup Steps

**You must execute each setup step exactly as written** in the documentation:

1. Run each command from the setup docs in order using the Bash tool
2. If the docs reference a script, run that script
3. Verify output matches expected behavior
4. If a prerequisite is missing (e.g., no Kubernetes cluster):
   - **Stop and inform the user** what prerequisite is needed
   - **Wait for user** to set it up or provide guidance
   - **Do not improvise** alternative setup methods
5. If a step fails or is unclear:
   - **Stop and explain** what failed to the user
   - **Propose a fix** to the documentation
   - **Get user approval** before updating the docs
   - **Continue** only after the docs are fixed and the step succeeds

Continue until setup is complete and verified.

### Step 1.3: Verify Environment Ready

Before proceeding to Phase 2, you must verify:

- [ ] All setup commands executed successfully
- [ ] Environment is verified working (run a simple test command from the docs)
- [ ] The features to be documented are accessible and functional

**Only proceed to Phase 2 after all checks pass.**

## Phase 2: Documentation Task

### Determine Task Type

If the documentation task is clear from context (e.g., from a PRD, previous conversation, or user's initial request), proceed directly. Otherwise, ask: "What documentation do you need to write?"

**Task types:**
1. **New guide** - Create a new guide file (write in chunks)
2. **Update existing guide** - Modify an existing doc with new sections
3. **Cross-reference updates** - Update multiple docs to reference new features

### For New Guides: Chunked Writing

**CRITICAL**: Write new guides in small chunks for easier review.

**Before writing**: Read existing guides in the same directory to understand the format, structure, and style. New guides should be consistent with existing documentation (headings, code block formatting, section order, etc.).

**Chunk Order:**
1. **Chunk 1: Header + Overview** (Title, summary, prerequisites, overview)
2. **Chunk 2: First major section** (e.g., basic usage, first workflow)
3. **Chunk 3: Second major section** (e.g., advanced usage, second workflow)
4. **Continue** with remaining sections, one at a time

**For each chunk:**
1. Tell user what to execute (these are the examples being documented)
2. Wait for them to paste actual output
3. Write the chunk using real output
4. Ask for review before proceeding to next chunk

### For Existing Guide Updates

1. Read the existing guide
2. Identify where new content should go
3. Tell user what to execute for documented examples
4. Write the update using real outputs
5. Show the diff/changes for review

### Execute-Then-Document Pattern

**User executes only what gets documented:**

1. **Tell user exactly what to run** - These are the examples that will appear in the docs
2. **Wait for actual output** - Never guess or fabricate outputs
3. **Use real output in docs** - Trim long outputs to show only the relevant parts; the goal is clarity, not completeness
4. **Note any variations** - If output varies, document what to expect

### Cross-Reference Updates

When a new feature is documented, search for related docs that may need updates (e.g., overviews, indexes, READMEs, related guides). For each file, show the specific edit and ask for confirmation.

## Phase 3: Cleanup

After documentation is complete:

1. **Tear down infrastructure** - If test environment was created and is no longer needed
2. **Suggest commit** - Remind user to commit changes

## Key Principle

You execute setup; user executes only the examples that will appear in the documentation.
