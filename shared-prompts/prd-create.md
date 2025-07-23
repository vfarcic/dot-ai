---
name: prd-create
description: Create documentation-first PRDs that guide development through user-facing content
category: project-management
---

# PRD Creation Slash Command

## Instructions

You are helping create a documentation-first Product Requirements Document (PRD) for a new feature. This process involves three components:

1. **GitHub Issue**: Short, immutable concept description that links to the detailed PRD
2. **PRD File**: Project management document with milestone tracking, progress logs, and references to documentation
3. **Documentation Updates**: Actual user-facing content written directly into documentation files with PRD traceability comments

## Process

### Step 1: Understand the Feature Concept
Ask the user to describe the feature idea to understand the core concept and scope.

### Step 2: Create GitHub Issue FIRST
Create the GitHub issue immediately to get the issue ID. This ID is required for proper PRD file naming.

### Step 3: Create PRD File with Correct Naming
Create the PRD file using the actual GitHub issue ID: `prds/[issue-id]-[feature-name].md`

### Step 4: Update GitHub Issue with PRD Link
Add the PRD file link to the GitHub issue description now that the filename is known.

### Step 5: Analyze Existing Documentation Architecture
BEFORE making any documentation changes, perform systematic analysis of ALL documentation files:

**A. Discover All Documentation Files**
```bash
# Find all documentation files (adapt for your project's documentation format)
find . -name "*.md" -not -path "*/node_modules/*" | sort

# Or for other formats:
find . -name "*.rst" -o -name "*.txt" -o -name "*.adoc" | sort
```

**B. Identify Feature/Capability References**
```bash  
# Search for existing feature lists and capability references
grep -r -i "capability\|feature\|guide.*\|provides.*\|main.*\|Key.*Features" docs/ README*

# Look for documentation indexes and cross-reference patterns
grep -r "- \*\*\[.*\]\|### .*Guide\|## Documentation" docs/ README*
```

**C. Use Task Tool for Pattern Analysis**
Use the Task tool to analyze ALL discovered files to understand:
- Current documentation structure and patterns
- Consistent section naming conventions  
- How features are introduced and described
- Whether there are verification/setup patterns for features
- Cross-reference architecture between docs
- Tone and style consistency
- Documentation indexes/lists that should include new content

### Step 6: Plan Complete Documentation Changes
Based on the analysis, create comprehensive checklist of ALL documentation files that need updates:

**Create systematic checklist:**
- [ ] New documentation files to create
- [ ] Existing files with capability/feature lists that need updates
- [ ] Documentation indexes (like README.md sections) that should include new content  
- [ ] Setup/configuration guides that need new sections
- [ ] Cross-reference sections ("See Also") that should link to new content
- [ ] Any files that mention related functionality and should acknowledge new capability

**Document the rationale for each update to ensure nothing is missed.**

### Step 7: Write Documentation Content First
Create/update ALL user-facing documentation content with `<!-- PRD-[issue-id] -->` comments for traceability, following established patterns.

### Step 8: Create PRD as Project Tracker
Work through the PRD template focusing on project management, milestone tracking, and references to the documentation content.

**Key Principle**: Focus on 5-10 major milestones rather than exhaustive task lists. Each milestone should represent meaningful progress that can be clearly validated.

**Good Milestones Examples:**
- [ ] Core functionality implemented and working
- [ ] Documentation complete and tested
- [ ] Integration with existing systems working
- [ ] Feature ready for user testing
- [ ] Feature launched and available

**Avoid Micro-Tasks:**
- ❌ Update README.md file
- ❌ Write test for function X
- ❌ Fix typo in documentation
- ❌ Individual file modifications

**Milestone Characteristics:**
- **Meaningful**: Represents significant progress toward completion
- **Testable**: Clear success criteria that can be validated
- **User-focused**: Relates to user value or feature capability
- **Manageable**: Can be completed in reasonable timeframe

## GitHub Issue Template (Keep Short & Stable)

**Initial Issue Creation (without PRD link):**
```markdown
## PRD: [Feature Name]

**Problem**: [1-2 sentence problem description]

**Solution**: [1-2 sentence solution overview]

**Detailed PRD**: Will be added after PRD file creation

**Priority**: [High/Medium/Low]
```

**Issue Update (after PRD file created):**
```markdown
## PRD: [Feature Name]

**Problem**: [1-2 sentence problem description]

**Solution**: [1-2 sentence solution overview]

**Detailed PRD**: See [prds/[actual-issue-id]-[feature-name].md](./prds/[actual-issue-id]-[feature-name].md)

**Priority**: [High/Medium/Low]
```

## Discussion Guidelines

### Documentation-First Planning Questions:
1. **Architecture Analysis**: "What are the existing documentation patterns and structures I need to follow?"
2. **User Experience**: "Walk me through the complete user journey - what will they read and do?"
3. **Documentation Impact**: "Which existing docs need updates? What new docs are needed?"
4. **Content Planning**: "What specific examples, commands, and workflows need to be documented?"
5. **Cross-File Story**: "How does the user story flow across multiple documentation files?"
6. **Pattern Consistency**: "How do other features handle setup, verification, and cross-references?"
7. **Testable Claims**: "What commands and examples can be automatically tested to ensure accuracy?"
8. **Implementation Phases**: "How can we deliver value incrementally through documentation updates?"
9. **Terminology Consistency**: "How do we ensure terminology and examples are consistent across ALL affected files?"
10. **Traceability**: "How will we track which documentation changes relate to this feature?"

### Content Creation Process:
1. **Analyze Documentation Architecture**: Use Task tool to understand existing patterns across ALL docs
2. **Map Complete Documentation Changes**: Identify all files that need updates (don't miss any!)
3. **Write User-Facing Content**: Create actual documentation content with examples following established patterns
4. **Add Traceability**: Include `<!-- PRD-[issue-id] -->` comments in documentation
5. **Update ALL Affected Files**: Ensure every file mentioned in PRD documentation map gets updated
6. **Plan Implementation**: Break down development tasks that enable documented functionality
7. **Validation Strategy**: Ensure all documented claims can be automatically tested

### Discussion Tips:
- **Clarify ambiguity**: If something isn't clear, ask follow-up questions until you understand
- **Challenge assumptions**: Help the user think through edge cases, alternatives, and unintended consequences
- **Prioritize ruthlessly**: Help distinguish between must-have and nice-to-have based on user impact
- **Think about users**: Always bring the conversation back to user value, experience, and outcomes
- **Consider feasibility**: While not diving into implementation details, ensure scope is realistic
- **Focus on major milestones**: Create 5-10 meaningful milestones rather than exhaustive micro-tasks
- **Think cross-functionally**: Consider impact on different teams, systems, and stakeholders

## Workflow

1. **Concept Discussion**: Get the basic idea and validate the need
2. **Create GitHub Issue FIRST**: Short, stable concept description to get issue ID
3. **Create PRD File**: Detailed document using actual issue ID: `prds/[issue-id]-[feature-name].md`
4. **Update GitHub Issue**: Add link to PRD file now that filename is known
5. **Section-by-Section Discussion**: Work through each template section systematically
6. **Milestone Definition**: Define 5-10 major milestones that represent meaningful progress
7. **Review & Validation**: Ensure completeness and clarity

**CRITICAL**: Steps 2-4 must happen in this exact order to avoid the chicken-and-egg problem of needing the issue ID for the filename.