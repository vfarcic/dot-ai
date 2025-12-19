# PRD #290: Skills Distribution via MCP

**GitHub Issue**: [#290](https://github.com/vfarcic/dot-ai/issues/290)
**Status**: Not Started
**Priority**: Medium
**Created**: 2025-12-19

---

## Problem Statement

Users who connect to the dot-ai MCP server receive prompts/commands, but there's **no way to automatically distribute skills** that work natively with their coding agents (Claude Code, Cursor, Windsurf, etc.).

Current limitations:

1. **MCP prompts are read-only** - Users can invoke them but can't get persistent local capabilities
2. **Skills require manual installation** - Users must separately find and install skills
3. **No leverage of skill features** - Current prompts don't use scripts/, references/, assets/, or allowed-tools
4. **Agent fragmentation** - Each agent stores skills in different locations

### Background Research

The [Agent Skills specification](https://agentskills.io/specification) defines a standard format (SKILL.md with YAML frontmatter) adopted by multiple agents. However:

- **Format is standardized**: SKILL.md with `name`, `description` frontmatter + markdown body
- **Location is NOT standardized**:
  - Claude Code: `~/.claude/skills` (global) or `.claude/skills/` (project)
  - Windsurf: `.windsurf/`
  - Cursor: `.cursor/` (rules only, no native skills yet)
  - Universal: `.agent/skills/`

---

## Solution Overview

Implement a two-part solution:

### Part 1: Install-Skills Prompt

Create an MCP prompt that returns skill file contents with instructions for the client agent to install them locally:

```
User invokes /install-skills
    ↓
MCP returns prompt with:
  - Agent selection question
  - Skill file contents (embedded)
  - File creation instructions
    ↓
Client agent creates files in correct location
    ↓
User has persistent local skills
```

### Part 2: Convert Prompts to Full Skills

Rewrite existing prompts (`shared-prompts/`) to leverage Agent Skills features:

| Feature | Current Prompts | Full Skills |
|---------|-----------------|-------------|
| Markdown instructions | ✅ | ✅ |
| `scripts/` (executable code) | ❌ | ✅ |
| `references/` (additional docs) | ❌ | ✅ |
| `assets/` (templates, data) | ❌ | ✅ |
| `allowed-tools` (restrict tools) | ❌ | ✅ |

### Part 3: Analyze MCP Tools for Skill Conversion

After completing skill conversions, analyze whether MCP tools should also become skills. This provides:
- Offline usage (no MCP connection required)
- Native agent integration
- Portable across different agents

---

## Technical Design

### 1. Install-Skills Prompt

Create `shared-prompts/install-skills.md`:

```markdown
---
name: install-skills
description: Install dot-ai skills locally for your coding agent
category: setup
---

# Install dot-ai Skills

## Step 1: Select Your Agent

Which coding agent are you using?

1. **Claude Code** - Skills will be installed to `.claude/skills/`
2. **Windsurf** - Skills will be installed to `.windsurf/skills/`
3. **Cursor** - Skills will be installed to `.cursor/skills/`
4. **Other/Universal** - Skills will be installed to `.agent/skills/`

Please tell me which agent you're using (1-4).

## Step 2: Create Skill Files

Based on your selection, create the following skill folders and files:

### Skill: prd-create

Create file: `[skills-path]/prd-create/SKILL.md`

\`\`\`markdown
---
name: prd-create
description: Create documentation-first PRDs that guide development
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

[Full skill content here...]
\`\`\`

[Additional skills...]

## Step 3: Verify Installation

After creating all files, verify by listing the skills directory.
```

### 2. Skills Directory Structure

Create a new `skills/` directory in the repository:

```
skills/
├── prd-create/
│   ├── SKILL.md
│   └── references/
│       └── prd-template.md
├── prd-start/
│   └── SKILL.md
├── prd-next/
│   └── SKILL.md
├── prd-done/
│   └── SKILL.md
├── prd-close/
│   └── SKILL.md
├── prd-update-progress/
│   └── SKILL.md
├── prd-update-decisions/
│   └── SKILL.md
├── prds-get/
│   └── SKILL.md
├── generate-dockerfile/
│   ├── SKILL.md
│   ├── scripts/
│   │   └── validate-dockerfile.sh
│   └── references/
│       └── dockerfile-best-practices.md
└── generate-cicd/
    ├── SKILL.md
    └── references/
        └── cicd-providers.md
```

### 3. Skill Enhancement Examples

**generate-dockerfile** with full skill features:

```
generate-dockerfile/
├── SKILL.md                          # Main instructions
├── scripts/
│   ├── validate-dockerfile.sh        # Run hadolint
│   └── analyze-project.py            # Detect language/framework
├── references/
│   ├── security-checklist.md         # Security best practices
│   └── multi-arch-guide.md           # Multi-architecture support
└── assets/
    └── templates/
        ├── nodejs.Dockerfile.template
        ├── python.Dockerfile.template
        └── go.Dockerfile.template
```

### 4. Dynamic Prompt Generation

The `install-skills` prompt should dynamically read skill contents from the `skills/` directory:

```typescript
// In MCP prompt handler
async function handleInstallSkills(): Promise<string> {
  const skillsDir = path.join(process.cwd(), 'skills');
  const skills = await fs.readdir(skillsDir);

  let promptContent = INSTALL_SKILLS_HEADER;

  for (const skillName of skills) {
    const skillPath = path.join(skillsDir, skillName);
    const skillContent = await readSkillRecursively(skillPath);
    promptContent += formatSkillForInstallation(skillName, skillContent);
  }

  promptContent += INSTALL_SKILLS_FOOTER;
  return promptContent;
}
```

---

## Scope

### In Scope

**M1: Skills Directory and Format**
- Create `skills/` directory structure
- Define skill format following Agent Skills spec
- Create template skill for reference

**M2: Convert Existing Prompts to Skills**
- Convert all 10 prompts from `shared-prompts/` to full skills
- Add scripts, references, and assets where beneficial
- Maintain backward compatibility (keep prompts working via MCP)

**M3: Install-Skills Prompt**
- Create dynamic `install-skills` prompt
- Support agent-specific installation paths
- Include all skills with proper formatting

**M4: Documentation**
- Document skill creation process
- Document installation process for users
- Update README with skills information

**M5: MCP Tool Analysis**
- Analyze which MCP tools could become skills
- Document findings and recommendations
- Create follow-up PRD if needed

### Out of Scope

- Automatic skill updates (manual reinstall required)
- Skill versioning and compatibility checking
- Skill marketplace integration
- Plugin marketplace creation (separate feature)

---

## Milestones

- [ ] **M1: Skills Directory and Format**
  - Create `skills/` directory structure
  - Create template skill following Agent Skills spec
  - Define conventions for scripts/, references/, assets/
  - Validate format against agentskills.io specification

- [ ] **M2: Convert Existing Prompts to Skills**
  - Convert PRD prompts (prd-create, prd-start, prd-next, prd-done, prd-close, prd-update-progress, prd-update-decisions, prds-get)
  - Convert generate-dockerfile with scripts and templates
  - Convert generate-cicd with references
  - Test each skill independently

- [ ] **M3: Install-Skills Prompt**
  - Create shared-prompts/install-skills.md
  - Implement dynamic skill content loading
  - Support Claude Code, Windsurf, Cursor, and universal paths
  - Test installation flow end-to-end

- [ ] **M4: Documentation**
  - Create docs/skills.md with user guide
  - Document skill creation for contributors
  - Update main README with skills section
  - Add skills to feedback form (per CLAUDE.md requirement)

- [ ] **M5: MCP Tool Analysis**
  - Analyze recommend, remediate, operate tools
  - Analyze manageOrgData, projectSetup tools
  - Document which tools benefit from skill conversion
  - Create follow-up PRD for tool-to-skill conversions

---

## Dependencies

### Internal Dependencies
- `shared-prompts/` - Existing prompts to convert
- MCP prompt handler - For serving install-skills

### External Dependencies
- Agent Skills specification (agentskills.io)
- Client agents (Claude Code, Cursor, Windsurf) for testing

---

## Success Criteria

1. **Skills install correctly**: User can run /install-skills and get working local skills
2. **All prompts converted**: 10 existing prompts available as full skills
3. **Enhanced capabilities**: At least 3 skills use scripts/, references/, or assets/
4. **Cross-agent support**: Installation works for Claude Code, Windsurf, Cursor
5. **Documentation complete**: Users can find and follow installation instructions
6. **Tool analysis complete**: Clear recommendation on which MCP tools should become skills

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Agent location changes | Use universal .agent/skills/ as fallback; document known paths |
| Large prompt size | Split into categories; allow partial installation |
| Skills format changes | Follow agentskills.io spec; version skills internally |
| Client agents don't create files | Provide manual installation instructions as backup |
| Script compatibility | Use portable bash/python; test on multiple platforms |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| **Ask user for agent type** | Location not standardized; explicit selection avoids assumptions |
| **Keep prompts AND skills** | Backward compatibility; MCP prompts work everywhere, skills are enhanced |
| **Dynamic prompt generation** | Single source of truth; skills directory is authoritative |
| **Separate skills/ from shared-prompts/** | Different purposes; skills are enhanced versions with extra features |
| **Analyze tools separately** | Scope control; tool conversion is significant work requiring separate PRD |

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-19 | PRD created |

---

## References

- [Agent Skills Specification](https://agentskills.io/specification)
- [Anthropic Skills Examples](https://github.com/anthropics/skills)
- [Simon Willison: Claude Skills](https://simonwillison.net/2025/Oct/16/claude-skills/)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [SkillPort](https://github.com/gotalab/skillport) - Universal skills loader
- [OpenSkills](https://github.com/numman-ali/openskills) - Cross-agent skills installer
