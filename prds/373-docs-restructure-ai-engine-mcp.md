# PRD #373: Restructure Docs into AI Engine and MCP Sections

## Problem

The documentation is MCP-centric — 10 of 16 guides carry an `mcp-` prefix, setup docs only cover MCP deployment, and the website has a single "MCP" top-level nav item. In reality, MCP is one of several access methods (MCP, REST API, CLI). The current structure conflates the product (an AI-powered server with capabilities) with one specific protocol used to access it.

## Solution

Replace the single "MCP" top-level website section with two peer top-level sections:

- **AI Engine** — The product. Capabilities, deployment, configuration, organizational data, observability. Access-method-agnostic. This is the bulk of the content.
- **MCP** — How to connect via MCP protocol. Thin, focused section.

Root-level repo files (`CHANGELOG.md`, `ROADMAP.md`, `GOVERNANCE.md`, `MAINTAINERS.md`, `CLAUDE.md`) stay at `docs/` root for GitHub purposes but are not part of the website navigation.

Produce an old-to-new path mapping and send feature requests to sibling `dot-ai*` projects so they can update links and language.

## Non-Goals

- Rewriting doc content from scratch (move, rename, update references, adjust MCP-centric language)
- Pre-analyzing sibling projects to determine their specific changes (they receive the mapping and decide)
- CLI or Web UI setup docs in this repo (those live in their respective projects)

## New Directory Structure

```
docs/
├── CHANGELOG.md                          # Repo-level, not on website
├── ROADMAP.md                            # Repo-level, not on website
├── GOVERNANCE.md                         # Repo-level, not on website
├── MAINTAINERS.md                        # Repo-level, not on website
├── CLAUDE.md                             # Repo-level, not on website
│
├── ai-engine/                            # TOP-LEVEL WEBSITE SECTION
│   ├── _category_.yml
│   ├── index.md                          # AI Engine landing page (from root index.md)
│   ├── quick-start.md                    # Getting started (from root quick-start.md)
│   ├── why-devops-ai-toolkit.md          # Value prop (from root)
│   │
│   ├── setup/
│   │   ├── _category_.yml
│   │   ├── deployment.md                 # Server deployment (from setup/mcp-setup.md, server parts)
│   │   └── gateway-api.md               # Gateway API variant (from setup/gateway-api.md)
│   │
│   ├── capabilities/
│   │   ├── _category_.yml
│   │   ├── overview.md                   # Capability catalog (from guides/mcp-tools-overview.md)
│   │   ├── query.md                      # Cluster querying (from guides/mcp-query-guide.md)
│   │   ├── recommend.md                  # Deployment recommendations (from guides/mcp-recommendation-guide.md)
│   │   ├── operate.md                    # Day 2 operations (from guides/mcp-operate-guide.md)
│   │   ├── remediate.md                  # Issue remediation (from guides/mcp-remediate-guide.md)
│   │   ├── knowledge-base.md            # Doc search (from guides/mcp-knowledge-base-guide.md)
│   │   ├── capability-management.md     # Resource discovery (from guides/mcp-capability-management-guide.md)
│   │   ├── project-setup.md             # Repo setup (from guides/mcp-project-setup-guide.md)
│   │   ├── prompts.md                   # Prompt library (from guides/mcp-prompts-guide.md)
│   │   └── version.md                   # Diagnostics (from guides/mcp-version-guide.md)
│   │
│   ├── organizational-data/
│   │   ├── _category_.yml
│   │   ├── concepts.md                  # Three pillars (from guides/organizational-data-concepts.md)
│   │   ├── patterns.md                  # Deployment patterns (from guides/pattern-management-guide.md)
│   │   └── policies.md                  # Governance policies (from guides/policy-management-guide.md)
│   │
│   ├── operations/
│   │   ├── _category_.yml
│   │   ├── observability.md             # Tracing (from guides/observability-guide.md)
│   │   └── telemetry.md                 # Analytics (from guides/telemetry-guide.md)
│   │
│   └── api/
│       ├── _category_.yml
│       └── rest-api.md                  # REST API reference (from guides/rest-api-gateway-guide.md)
│
├── mcp/                                  # TOP-LEVEL WEBSITE SECTION
│   ├── _category_.yml
│   ├── index.md                          # MCP section landing (new)
│   └── setup.md                          # MCP client configuration (extracted from setup/mcp-setup.md)
│
└── dev/                                  # Repo-level, not on website
    └── integration-testing-guide.md      # Unchanged
```

## Path Mapping (Old → New)

This is the key artifact. Sibling projects receive this table to update their links and language.

| Old Path | New Path | Notes |
|----------|----------|-------|
| `index.md` | `ai-engine/index.md` | Rewritten as AI Engine landing page |
| `quick-start.md` | `ai-engine/quick-start.md` | Updated to be access-method-agnostic |
| `why-devops-ai-toolkit.md` | `ai-engine/why-devops-ai-toolkit.md` | Moved |
| `setup/mcp-setup.md` | `ai-engine/setup/deployment.md` + `mcp/setup.md` | Split: server deployment vs MCP client config |
| `setup/gateway-api.md` | `ai-engine/setup/gateway-api.md` | Moved |
| `guides/mcp-tools-overview.md` | `ai-engine/capabilities/overview.md` | Renamed, remove MCP framing |
| `guides/mcp-query-guide.md` | `ai-engine/capabilities/query.md` | Renamed |
| `guides/mcp-recommendation-guide.md` | `ai-engine/capabilities/recommend.md` | Renamed |
| `guides/mcp-operate-guide.md` | `ai-engine/capabilities/operate.md` | Renamed |
| `guides/mcp-remediate-guide.md` | `ai-engine/capabilities/remediate.md` | Renamed |
| `guides/mcp-knowledge-base-guide.md` | `ai-engine/capabilities/knowledge-base.md` | Renamed |
| `guides/mcp-capability-management-guide.md` | `ai-engine/capabilities/capability-management.md` | Renamed |
| `guides/mcp-project-setup-guide.md` | `ai-engine/capabilities/project-setup.md` | Renamed |
| `guides/mcp-prompts-guide.md` | `ai-engine/capabilities/prompts.md` | Renamed |
| `guides/mcp-version-guide.md` | `ai-engine/capabilities/version.md` | Renamed |
| `guides/organizational-data-concepts.md` | `ai-engine/organizational-data/concepts.md` | Moved |
| `guides/pattern-management-guide.md` | `ai-engine/organizational-data/patterns.md` | Moved |
| `guides/policy-management-guide.md` | `ai-engine/organizational-data/policies.md` | Moved |
| `guides/observability-guide.md` | `ai-engine/operations/observability.md` | Moved |
| `guides/telemetry-guide.md` | `ai-engine/operations/telemetry.md` | Moved |
| `guides/rest-api-gateway-guide.md` | `ai-engine/api/rest-api.md` | Moved |
| *(new)* | `mcp/index.md` | New: MCP section landing page |
| *(new)* | `mcp/setup.md` | New: MCP client config extracted from setup/mcp-setup.md |

## Content Changes Required

Beyond moving files:

1. **Strip MCP-centric language** from capability docs — replace "MCP tool" with "capability" or "tool", remove assumptions that the user is using an MCP client
2. **Split `setup/mcp-setup.md`** — server deployment (Helm, Kubernetes) goes to `ai-engine/setup/deployment.md`; MCP client configuration (`.mcp.json`, client setup) goes to `mcp/setup.md`
3. **Create `mcp/index.md`** — landing page explaining what MCP is and when to use it
4. **Rewrite `ai-engine/index.md`** — present the AI Engine as the product, list access methods as peers
5. **Update `ai-engine/quick-start.md`** — access-method-agnostic getting started
6. **Update all internal cross-references** — every link between docs needs updating
7. **Update `docs/CLAUDE.md`** — adjust naming conventions for new structure
8. **Update root `README.md`** — update doc links if present

## Milestones

- [ ] **M1: Create new directory structure and move files** — Create `ai-engine/` and `mcp/` directories with all subdirectories, move all files per the mapping table, add `_category_.yml` files for sidebar ordering. Delete old `setup/` and `guides/` directories.
- [ ] **M2: Split mcp-setup.md into deployment + MCP client config** — Extract server deployment content into `ai-engine/setup/deployment.md`, create `mcp/setup.md` with MCP client configuration, create `mcp/index.md` landing page.
- [ ] **M3: Update content — remove MCP-centric language** — Go through each capability doc and replace MCP-specific framing with access-method-agnostic language.
- [ ] **M4: Update all internal cross-references** — Fix every internal link across all docs to reflect new paths.
- [ ] **M5: Update entry points and meta docs** — Rewrite `ai-engine/index.md` and `ai-engine/quick-start.md` for new structure. Update `docs/CLAUDE.md` and root `README.md`.
- [ ] **M6: Send feature requests to sibling projects** — Send the path mapping table and restructure description to `dot-ai-website` and other `dot-ai*` projects via `tmp/feature-request.md`. The website request should specify replacing the single "MCP" top-level nav with two peer sections: "AI Engine" and "MCP".

## Success Criteria

- All docs live under `ai-engine/` or `mcp/` (old `guides/` and `setup/` directories removed)
- No capability doc assumes MCP is the only or primary access method
- The path mapping table is accurate and complete
- Sibling projects have received feature requests with the mapping
- All internal links resolve correctly

## Risks

- **Broken links during transition** — Mitigated by the mapping table and coordinated feature requests to sibling projects
- **Website build breaks** — `dot-ai-website` must update before or in sync with this change; the feature request should communicate this dependency
- **Content drift** — MCP assumptions may be deeply embedded in examples and workflows; M3 may surface more work than expected

## Dependencies

- None for M1–M5 (all within this repo)
- M6 depends on M1–M5 being complete so the mapping is final
- Sibling project work depends on M6

## Priority

High — The CLI has shipped with full feature parity (v1.1.0), and the docs no longer reflect the actual architecture.
