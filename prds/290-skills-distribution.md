# PRD #290: Skills Distribution via MCP

**GitHub Issue**: [#290](https://github.com/vfarcic/dot-ai/issues/290)
**Status**: In Progress
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
- **Location varies by agent**:
  - Claude Code: `~/.claude/skills` (global) or `.claude/skills/` (project)
  - Windsurf: `.windsurf/skills/`
  - Cursor: `.cursor/skills/`
  - Universal: `.agent/skills/`

**Agent Support Confirmed (Dec 2025)**: Agent Skills is now widely adopted:
- Claude Code, Cursor, GitHub Copilot, VS Code, OpenAI Codex, OpenCode, Amp, Goose, Letta
- Skills in `.claude/skills/` are automatically picked up by Copilot (cross-compatibility)
- Source: [agentskills.io](https://agentskills.io/home), [Cursor docs](https://cursor.com/docs/context/skills), [GitHub Changelog](https://github.blog/changelog/2025-12-18-github-copilot-now-supports-agent-skills/)

**Invocation Methods Vary by Agent (Dec 2025)**:
| Agent | Natural Language | `/skill-name` Command |
|-------|------------------|----------------------|
| Claude Code | ✅ Auto-invoked based on description | ✅ Supported |
| GitHub Copilot | ✅ Auto-activated based on prompt | ❌ Not supported |
| Cursor | ✅ Agent decides when relevant | ❌ Not supported |
| Windsurf | Uses separate "workflows" system | Workflows support `/workflow-name` |

**Key Insight**: Only Claude Code supports both natural language ("Create a PRD") AND explicit `/skill-name` invocation. Other agents rely solely on automatic/natural language activation based on the skill's description matching the user's request.

**Commands vs Skills - Separate Systems**:
| Concept | Location | Invocation | Purpose |
|---------|----------|------------|---------|
| **Skills** | `.claude/skills/`, `.cursor/skills/` | Auto-invoked by AI | Complex workflows, context, logic |
| **Commands** | `.claude/commands/`, `.cursor/commands/` | Explicit `/command` | User-triggered shortcuts |

Most agents support BOTH systems, allowing explicit `/command` invocation alongside auto-invoked skills.

---

## Solution Overview

Implement a **skills + MCP prompts as invokers** approach - skills contain all logic, existing MCP prompts are rewritten to invoke skills:

### Architecture: MCP Prompts as Skill Invokers

```
skills/prd-create/SKILL.md       ← Contains ALL logic (installed locally)
shared-prompts/prd-create.md     ← MCP prompt: "Use the prd-create skill"
```

**How invocation works:**

| User Action | Flow |
|-------------|------|
| "Create a PRD" | AI auto-invokes skill directly (if installed locally) |
| `/prd-create` (MCP) | MCP prompt loads → instructs AI to use skill → skill executes |

**Example MCP prompt** (`shared-prompts/prd-create.md`):
```markdown
---
name: prd-create
description: Create a PRD
---

Use the prd-create skill to create a documentation-first PRD for the user's request.
```

**Benefits:**
- **No new infrastructure**: Reuse existing `shared-prompts/` and MCP prompt system
- **Single source of truth**: All logic lives in skills
- **No divergence risk**: MCP prompts are ~2-3 lines, just invoke skills
- **Both invocation methods**: Natural language (skill) AND explicit `/command` (MCP prompt)
- **Graceful degradation**: If skills not installed, MCP prompt still tells user what to do

### Part 1: Auto-Install Skills on MCP Initialization

Skills can be automatically installed when the MCP server initializes, eliminating the need for manual `/install-skills` invocation:

**Option A: Config-based (Recommended)**
```
User configures MCP with AGENT_TYPE env var
    ↓
MCP server initializes
    ↓
MCP detects agent type from config
    ↓
Skills auto-installed to correct location
    ↓
User has skills immediately - zero friction
```

**MCP Configuration Example:**
```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "@dot-ai/mcp"],
      "env": {
        "AGENT_TYPE": "claude"  // or "cursor", "copilot", "universal"
      }
    }
  }
}
```

**Option B: Fallback `/install-skills` Prompt**

For users who don't configure `AGENT_TYPE`, keep the manual install prompt as fallback:

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

### Part 2: Convert Prompts to Skills (Replace MCP Prompts)

Convert existing prompts (`shared-prompts/`) to Agent Skills and **gracefully deprecate** the MCP prompts:

**Deprecation Strategy:**
```
User invokes /prd-create (deprecated MCP prompt)
    ↓
Prompt outputs deprecation notice:
  "⚠️ DEPRECATION NOTICE: MCP prompts are being replaced by Agent Skills.

   Please install skills for a better experience:
   - Run /install-skills to get started
   - Skills work offline and across all major agents

   This prompt will be removed in a future release."
    ↓
(Prompt still executes for backward compatibility during transition)
```

**Note:** Full prompt retirement will be handled in a separate follow-up PRD after adoption period.

Skills provide:

| Feature | Current Prompts | Full Skills |
|---------|-----------------|-------------|
| Markdown instructions | ✅ | ✅ |
| `scripts/` (executable code) | ❌ | ✅ |
| `references/` (additional docs) | ❌ | ✅ |
| `assets/` (templates, data) | ❌ | ✅ |
| `allowed-tools` (restrict tools) | ❌ | ✅ |

### Part 3: Analyze MCP Tools for Skill Conversion

After completing skill conversions, analyze whether MCP tools could benefit from a **"Skills as Front-Doors"** hybrid pattern:

```
User invokes /recommend (skill)
    ↓
Skill gathers intent via conversation:
  - "What do you want to deploy?"
  - Clarifies requirements
    ↓
Skill instructs agent to call MCP tool:
  - "Call recommend tool with intent: 'PostgreSQL with HA'"
    ↓
MCP tool handles complex backend:
  - Query cluster capabilities
  - Generate manifests, deploy
```

**Layer Responsibilities:**
| Layer | Best For |
|-------|----------|
| **Skills** | Conversation, intent gathering, clarification, offline guidance |
| **MCP Tools** | Cluster access, backend computation, state management |

This hybrid provides:
- Better UX (natural conversation before technical execution)
- Offline capability (intent gathering works without MCP)
- Cleaner separation (conversation vs computation)

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

**M2: Convert Existing Prompts to Skills + Rewrite MCP Prompts**
- Convert all 10 prompts from `shared-prompts/` to full skills in `skills/` directory
- Add scripts, references, and assets where beneficial
- Analyze enhancement opportunities during each conversion
- Rewrite existing MCP prompts (`shared-prompts/`) to invoke corresponding skills
- MCP prompts become thin wrappers (~2-3 lines) that tell AI to use the skill

**M3: Skills Auto-Installation**
- Implement auto-install on MCP server initialization when `AGENT_TYPE` env var is set
- Support agent-specific installation paths (claude, cursor, copilot, universal)
- Create fallback `install-skills` prompt for users without `AGENT_TYPE` configured
- Include all skills with proper formatting

**M4: Documentation**
- Document skill creation process
- Document installation process for users
- Update README with skills information

**M5: MCP Tool Analysis**
- Analyze which MCP tools could benefit from "Skills as Front-Doors" pattern
- Evaluate hybrid approach: skill handles conversation/intent, MCP tool handles backend
- Document findings and recommendations for each tool (recommend, remediate, operate, manageOrgData, projectSetup)
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

- [ ] **M2: Convert Existing Prompts to Skills + Rewrite MCP Prompts**
  - Convert PRD prompts (prd-create, prd-start, prd-next, prd-done, prd-close, prd-update-progress, prd-update-decisions, prds-get)
  - Convert generate-dockerfile with scripts and templates
  - Convert generate-cicd with references
  - Analyze and add enhancements (scripts/, references/, assets/) during each conversion
  - Rewrite each MCP prompt in `shared-prompts/` to invoke corresponding skill
  - Test each skill independently
  - Test `/command` via MCP → skill invocation flow

- [ ] **M3: Skills Auto-Installation**
  - Implement auto-install on MCP server initialization
  - Read `AGENT_TYPE` env var to determine installation path
  - Support paths: claude (~/.claude/skills), cursor (~/.cursor/skills), copilot, universal (.agent/skills)
  - Create fallback shared-prompts/install-skills.md for users without AGENT_TYPE
  - Test auto-installation and fallback prompt end-to-end

- [ ] **M4: Documentation**
  - Create docs/skills.md with user guide
  - Document skill creation for contributors
  - Update main README with skills section
  - Add skills to feedback form (per CLAUDE.md requirement)

- [ ] **M5: MCP Tool Analysis**
  - Evaluate "Skills as Front-Doors" hybrid pattern for each tool:
    - `recommend`: Skill gathers deployment intent → MCP queries capabilities and deploys
    - `remediate`: Skill gathers issue description → MCP analyzes cluster and fixes
    - `operate`: Skill gathers operation intent → MCP executes with validation
    - `manageOrgData`: Evaluate if conversational front-end adds value
    - `projectSetup`: Skill gathers project requirements → MCP generates configs
  - Document which tools benefit from hybrid approach vs staying MCP-only
  - Create follow-up PRD for tool-to-skill conversions if warranted

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

1. **Skills auto-install**: Skills automatically installed when MCP initializes with `AGENT_TYPE` configured; fallback `/install-skills` works for manual installation
2. **All prompts converted**: 10 existing prompts converted to skills with natural language invocation
3. **MCP prompts rewritten**: All MCP prompts rewritten to invoke corresponding skills
4. **Enhanced capabilities**: At least 3 skills use scripts/, references/, or assets/
5. **Cross-agent support**: Installation works for Claude Code, Cursor, Copilot, and universal path
6. **Both invocation methods work**: Natural language triggers skill; `/command` via MCP triggers skill
7. **Documentation complete**: Users can find and follow installation instructions
8. **Tool analysis complete**: Clear recommendation on which MCP tools should become skills

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Agent location changes | Use universal .agent/skills/ as fallback; cross-compatibility between agents confirmed |
| Large prompt size | Split into categories; allow partial installation |
| Skills format changes | Follow agentskills.io spec; format is now an open standard with broad adoption |
| Client agents don't create files | Provide manual installation instructions as backup |
| Script compatibility | Use portable bash/python; test on multiple platforms |
| `/skill-name` not portable | Only Claude Code supports explicit `/skill-name` invocation; other agents use natural language only; write clear skill descriptions to ensure reliable auto-invocation across all agents |
| Natural language invocation reliability | Write precise, unique skill descriptions; test invocation across multiple agents to ensure skills activate when expected |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-19 | **Ask user for agent type** | Location not standardized; explicit selection avoids assumptions |
| 2025-12-19 | **Dynamic prompt generation** | Single source of truth; skills directory is authoritative |
| 2025-12-19 | **Analyze tools separately** | Scope control; tool conversion is significant work requiring separate PRD |
| 2025-12-21 | **~~Skills-only approach~~ → Skills + MCP prompts as invokers** | Agent Skills contain all logic; MCP prompts rewritten as thin wrappers to invoke skills; both invocation methods supported |
| 2025-12-23 | **~~Use `disable-model-invocation: true`~~ CORRECTED** | `disable-model-invocation` is a slash command option, not a skill option; skills are always model-invoked by default; this decision was based on incorrect understanding of the Agent Skills spec |
| 2025-12-21 | **Analyze prompts during conversion** | More efficient than upfront analysis; enhancement opportunities discovered while working with each prompt |
| 2025-12-23 | **~~Deprecate shared-prompts/~~ → Rewrite as skill invokers** | Instead of deprecating MCP prompts, rewrite them to invoke skills; keeps `/command` working via MCP while skills contain all logic |
| 2025-12-21 | **"Skills as Front-Doors" pattern for MCP tools** | Hybrid architecture where skills handle conversation/intent gathering, MCP tools handle backend computation; better UX, offline intent gathering, cleaner separation of concerns |
| 2025-12-21 | **Auto-install skills on MCP initialization** | Use `AGENT_TYPE` env var in MCP config to auto-install skills when server starts; zero-friction UX for configured users; fallback `/install-skills` prompt for unconfigured users |
| 2025-12-23 | **Cross-agent invocation differences acknowledged** | Only Claude Code supports both natural language AND `/skill-name` invocation; Copilot/Cursor use natural language only; Windsurf uses separate "workflows" system; skill descriptions must be clear enough for reliable auto-invocation across all agents |
| 2025-12-23 | **Skills use natural language invocation (primary)** | Skills are model-invoked by default across all agents; `/skill-name` is a Claude Code bonus, not the primary invocation method; focus on writing excellent skill descriptions for cross-agent compatibility |
| 2025-12-23 | **MCP prompts as skill invokers** | Keep MCP prompts but rewrite them to invoke skills; provides both invocation methods (natural language via skill, `/command` via MCP prompt); single source of truth in skills; no new infrastructure needed |

---

## References

- [Agent Skills Specification](https://agentskills.io/specification)
- [Anthropic Skills Examples](https://github.com/anthropics/skills)
- [Simon Willison: Claude Skills](https://simonwillison.net/2025/Oct/16/claude-skills/)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [SkillPort](https://github.com/gotalab/skillport) - Universal skills loader
- [OpenSkills](https://github.com/numman-ali/openskills) - Cross-agent skills installer
