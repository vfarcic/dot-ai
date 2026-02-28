# PRD #290: Skills Distribution via MCP

**GitHub Issue**: [#290](https://github.com/vfarcic/dot-ai/issues/290)
**Status**: Closed (Superseded)
**Priority**: Medium
**Created**: 2025-12-19
**Closed**: 2026-02-28

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

## Investigation Summary (Dec 2025)

**Status: Work on hold due to fundamental MCP limitations**

During implementation of M3 (Skills Installation Infrastructure), we discovered significant technical barriers that make seamless skills distribution impractical with current MCP capabilities.

### Key Findings

#### 1. MCP Cannot Auto-Install Skills

**Problem:** MCP server may run remotely (Docker, Kubernetes, cloud) and cannot write to user's local filesystem where skills must reside.

**Explored solutions:**
- Auto-install on MCP init → Only works if MCP runs locally
- Embed skills in MCP prompts → ~32K tokens, unreliable AI file creation
- MCP Resources → Read-only; client can't write to disk via MCP
- Release artifact download → Works, but requires manual user action

#### 2. No Version Sync Mechanism

**Problem:** Skills installed locally may become outdated when MCP server updates. No mechanism exists to notify users or auto-update.

**Explored solutions:**
- Version check on skill invocation → Doesn't catch new skills user doesn't know about
- Auto-update on skill invocation → Same problem with new skills
- MCP initialization hook → Doesn't exist in MCP spec
- OAuth-style browser trigger → Only for authentication, not general actions

#### 3. MCP Lifecycle Limitations

**Findings from MCP spec investigation:**
- No "on connect" hook for user-facing actions
- `initialize`/`initialized` is protocol-level, not user-visible
- `notifications/message` is for logging/debugging, not user messaging
- OAuth 401 flow (browser open) is auth-specific, can't repurpose for skills
- Server cannot proactively push user-visible notifications

#### 4. The Fundamental Tension

```
Skills as source of truth     vs.     Version alignment
─────────────────────────────────────────────────────────
MCP prompts are thin wrappers        Cannot guarantee user has
Skills contain all logic             correct skill version
                                     No auto-update mechanism
```

### What Would Make Skills Viable

For skills distribution to work seamlessly, MCP would need ONE of:

1. **Server-initiated file transfer** - MCP spec allowing servers to push files to client filesystem
2. **On-connect user notification** - Hook to display version warnings when client connects
3. **Resource write capability** - Ability for clients to save MCP resources locally
4. **Standardized skill sync** - Protocol-level skill versioning and update mechanism

### Completed Work (Preserved)

- `skills/prd-create/` - Full skill with references (can serve as reference implementation)
- `shared-prompts/prd-create.md` - Thin wrapper demonstrating the pattern
- Architecture documentation in this PRD

### Recommendation

**Keep MCP prompts self-contained** (current approach). They provide:
- Always-current version (no sync issues)
- No installation required
- Works immediately on connection
- Full functionality via `/command` invocation

Skills could be revisited when:
- MCP spec adds file transfer or initialization hooks
- A standardized skill sync protocol emerges
- Offline usage becomes a critical user requirement

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

### Part 1: Skills Installation via Release Artifact

Skills are distributed as version-aligned release artifacts, downloaded via `/install-skills` prompt:

```
Release v0.171.0 published
    ↓
CI/CD creates skills.tar.gz artifact (~115KB)
    ↓
User connects to MCP server v0.171.0
    ↓
User invokes /install-skills
    ↓
MCP returns prompt with version-specific download command:
  - curl + tar command with v0.171.0 URL
  - Agent-specific paths (claude, cursor, copilot, universal)
    ↓
User runs command locally
    ↓
Skills installed to correct location
```

**Why not auto-install on MCP init?**
MCP server may run remotely (Docker, Kubernetes, cloud) and cannot write to user's local filesystem. The download approach works regardless of where MCP runs.

**Benefits:**
- Version-aligned (skills match MCP version)
- Works with remote MCP servers
- Tiny prompt (~500 tokens vs ~32K for embedded content)
- Simple curl + tar (no Docker required)

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

### 1. Install-Skills Prompt (Version-Aligned Download)

The `/install-skills` prompt dynamically generates download commands using the MCP server's version:

**Architecture:**
```
Release v0.171.0
    │
    ├─► Container: ghcr.io/vfarcic/dot-ai:v0.171.0
    │
    └─► Artifact: github.com/vfarcic/dot-ai/releases/download/v0.171.0/skills.tar.gz

User connects to MCP v0.171.0
    │
    ▼
/install-skills prompt generates version-specific URL:
    │
    └─► "curl -sL https://github.com/.../v0.171.0/skills.tar.gz | tar -xz -C ~/.claude/skills"
```

**Dynamic prompt generation** (`src/prompts/install-skills.ts`):
```typescript
export async function generateInstallSkillsPrompt(): Promise<string> {
  const version = getPackageVersion(); // e.g., "0.171.0"
  const downloadUrl = `https://github.com/vfarcic/dot-ai/releases/download/v${version}/skills.tar.gz`;

  return `
# Install dot-ai Skills (v${version})

Select your agent and run the command:

| Agent | Command |
|-------|---------|
| Claude Code | \`mkdir -p ~/.claude/skills && curl -sL ${downloadUrl} | tar -xz -C ~/.claude/skills\` |
| Cursor | \`mkdir -p ~/.cursor/skills && curl -sL ${downloadUrl} | tar -xz -C ~/.cursor/skills\` |
| Copilot | \`mkdir -p ~/.claude/skills && curl -sL ${downloadUrl} | tar -xz -C ~/.claude/skills\` |
| Universal | \`mkdir -p .agent/skills && curl -sL ${downloadUrl} | tar -xz -C .agent/skills\` |

## Verify
\`ls ~/.claude/skills\`  (or your agent's path)
`;
}
```

**CI/CD addition** (GitHub Actions release workflow):
```yaml
- name: Package skills
  run: tar -czf skills.tar.gz -C skills .

- name: Upload skills artifact
  uses: softprops/action-gh-release@v1
  with:
    files: skills.tar.gz
```

**Benefits:**
- ~500 tokens (vs ~32K tokens for embedded content)
- Version-aligned (skills match MCP version)
- No Docker required
- Works on all platforms with curl + tar

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

---

## Scope

### In Scope

**M1: Skills Directory and Format**
- Create `skills/` directory structure
- Define skill format following Agent Skills spec
- Create template skill for reference

**M2: Convert Existing Prompts to Skills + Rewrite MCP Prompts**
- For each prompt conversion:
  1. Analyze the prompt to identify enhancement opportunities
  2. Check agentskills.io docs for available features and best practices
  3. Convert to skill leveraging appropriate features
  4. Replace command-style references (e.g., "run /prd-start") with natural language (e.g., "say 'Start working on PRD #X'")
  5. Rewrite MCP prompt as thin wrapper: `Use the **skill-name** skill.`
- Convert all 10 prompts from `shared-prompts/` to full skills in `skills/` directory

**M3: Skills Installation Infrastructure**
- Add skills tarball creation to CI/CD release workflow
- Implement dynamic `/install-skills` prompt with version-aligned download URL
- Support agent-specific installation paths (claude, cursor, copilot, universal)
- Test end-to-end: release → download → install → verify

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

- [x] **M1: Skills Directory and Format**
  - Create `skills/` directory structure
  - ~~Create template skill following Agent Skills spec~~ (Decision: first real skill is the reference)
  - Define conventions for scripts/, references/, assets/
  - Validate format against agentskills.io specification

- [ ] **M2: Convert Existing Prompts to Skills + Rewrite MCP Prompts**
  - For each prompt:
    1. Analyze for enhancement opportunities
    2. Check agentskills.io docs for features and best practices
    3. Convert to skill with appropriate enhancements
    4. Replace command-style references with natural language invocation
    5. Rewrite MCP prompt: `Use the **skill-name** skill.`
  - Prompt conversions:
    - [x] prd-create (with references/prd-template.md)
    - [ ] prd-start
    - [ ] prd-next
    - [ ] prd-done
    - [ ] prd-close
    - [ ] prd-update-progress
    - [ ] prd-update-decisions
    - [ ] prds-get
    - [ ] generate-dockerfile
    - [ ] generate-cicd
  - Test each skill independently
  - Test `/command` via MCP -> skill invocation flow
  - **Note**: Complete M3 first to validate distribution before mass conversion

- [ ] **M3: Skills Installation Infrastructure**
  - Add skills tarball creation to CI/CD release workflow (GitHub Actions)
  - Implement dynamic `/install-skills` prompt generation with version-aligned URL
  - Support paths: claude (~/.claude/skills), cursor (~/.cursor/skills), copilot (~/.claude/skills), universal (.agent/skills)
  - Test end-to-end: release artifact → curl download → tar extract → verify installation

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

1. **Skills download works**: `/install-skills` generates version-aligned download command; curl + tar installs skills successfully
2. **All prompts converted**: 10 existing prompts converted to skills with natural language invocation
3. **MCP prompts rewritten**: All MCP prompts rewritten to invoke corresponding skills
4. **Enhanced capabilities**: At least 3 skills use scripts/, references/, or assets/
5. **Cross-agent support**: Installation works for Claude Code, Cursor, Copilot, and universal path
6. **Both invocation methods work**: Natural language triggers skill; `/command` via MCP triggers skill
7. **Documentation complete**: Users can find and follow installation instructions
8. **Tool analysis complete**: Clear recommendation on which MCP tools should become skills
9. **Release artifact published**: skills.tar.gz included in every GitHub release

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
| 2025-12-23 | **No template skill** | Skip creating a fake `_template` skill; first real skill (prd-create) serves as the reference implementation; template would violate spec (underscore not allowed) and confuse auto-installer |
| 2025-12-23 | **Minimal MCP prompt format** | MCP prompts should be exactly: `Use the **skill-name** skill.` - no additional explanation needed since skill name and MCP description already convey purpose |
| 2025-12-23 | **Validate M3 before mass M2 conversion** | Convert one skill first (prd-create), implement auto-installation (M3), validate full flow works, then convert remaining prompts; ensures infrastructure works before investing in conversions |
| 2025-12-23 | **Natural language invocation in skills** | Skills must use natural language patterns (e.g., "say 'Start working on PRD #X'") instead of command-style references (e.g., "run /prd-start"); skills are auto-invoked by AI based on description, not explicit commands |
| 2025-12-23 | **~~Auto-install on MCP init~~ → Release artifact download** | MCP server may run remotely (Docker, K8s, cloud) and cannot write to user's local filesystem; instead, publish skills tarball as GitHub release artifact and have `/install-skills` prompt instruct user to download via curl |
| 2025-12-23 | **Version-aligned skill distribution** | Skills tarball published with each release; `/install-skills` prompt dynamically generates download URL using MCP's own version (e.g., `v0.171.0/skills.tar.gz`); ensures skills always match connected MCP version |
| 2025-12-23 | **Curl + tar installation** | Simple, universal installation via `curl -sL {url} \| tar -xz -C {skills-path}`; no Docker required; works on all platforms; ~115KB download vs embedding ~32K tokens in prompt |
| 2025-12-23 | **PRD ON HOLD - MCP limitations** | Fundamental barriers discovered: (1) MCP can't auto-install to user's local filesystem when running remotely; (2) No version sync mechanism exists; (3) No MCP "on connect" hook for user notifications; (4) Users wouldn't discover new skills added in updates. Complexity outweighs benefits given current MCP spec limitations. |

---

## Current Status

**Last Updated**: 2026-02-28

**Status**: CLOSED - Superseded by PRD #306 and PRD #387

### Why On Hold

During M3 implementation planning, we discovered fundamental MCP limitations that prevent seamless skills distribution:

1. **Remote MCP problem**: Server can't write to user's local filesystem
2. **No version sync**: No mechanism to notify users when skills are outdated
3. **No discovery of new skills**: Users won't know about skills added in updates
4. **Manual action required**: Every approach requires user to run `/install-skills` manually

The complexity of working around these limitations outweighs the benefits, especially since MCP prompts already provide full functionality.

### Completed Work (Preserved)

- [x] M1: Skills directory structure (`skills/prd-create/`)
- [x] M2 (partial): One skill converted as reference implementation
- [x] Architecture design documented in this PRD
- [x] Investigation of MCP spec limitations documented

### Deferred Work

- [ ] M2: Remaining 9 prompt conversions
- [ ] M3: Skills installation infrastructure
- [ ] M4: Documentation
- [ ] M5: MCP tool analysis

### Conditions to Revisit

This PRD should be revisited when ANY of these occur:

1. **MCP spec adds file transfer** - Server can push files to client
2. **MCP adds on-connect hooks** - User-visible notifications on connection
3. **MCP resources become writable** - Clients can save resources locally
4. **Offline usage demand** - Users explicitly request offline capabilities
5. **Skill sync protocol emerges** - Standardized skill versioning/updating

---

## References

### Agent Skills
- [Agent Skills Specification](https://agentskills.io/specification)
- [Anthropic Skills Examples](https://github.com/anthropics/skills)
- [Simon Willison: Claude Skills](https://simonwillison.net/2025/Oct/16/claude-skills/)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [SkillPort](https://github.com/gotalab/skillport) - Universal skills loader
- [OpenSkills](https://github.com/numman-ali/openskills) - Cross-agent skills installer

### MCP Specification (Investigated Dec 2025)
- [MCP Resources](https://modelcontextprotocol.io/docs/concepts/resources) - Read-only, no write capability
- [MCP Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) - No user-facing init hooks
- [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) - OAuth flow (browser open) is auth-specific
- [MCP Logging](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging) - For debugging, not user messaging
- [Spring AI MCP OAuth](https://spring.io/blog/2025/05/19/spring-ai-mcp-client-oauth2/) - How OAuth browser flow works
- [Auth0 MCP Introduction](https://auth0.com/blog/an-introduction-to-mcp-and-authorization/) - MCP auth patterns
