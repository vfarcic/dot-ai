# PRD #387: Serve Folder-Based Skills from Git Repositories

**Status**: In Progress
**Priority**: Medium
**Related Issue**: #379 (original feature request)

## Problem

The server loads user-defined prompts from a git repository (`DOT_AI_USER_PROMPTS_REPO`), but only supports flat `.md` files. Real-world skills are folder-based — a directory containing `SKILL.md` plus supporting files (shell scripts, manifests, templates). Today, folder-based skills can only be distributed via git submodules, creating two disconnected distribution mechanisms.

**Current behavior** (`user-prompts-loader.ts:296-298`):
```typescript
const files = fs.readdirSync(promptsDir);
const promptFiles = files.filter(file => file.endsWith('.md'));
```
Subdirectories are completely ignored.

## Solution

Extend `user-prompts-loader` to also scan for subdirectories containing a `SKILL.md` file. For each skill folder found, load the `SKILL.md` as the prompt content and include the supporting files (base64-encoded) in the response. Use the existing `/api/v1/prompts` endpoints — no new endpoints needed.

**Example repo structure after this change:**
```
user-prompts-repo/
├── eval-run.md                    # Flat prompt (existing behavior)
├── eval-analyze-test-failure.md   # Flat prompt (existing behavior)
└── worktree-prd/                  # Skill folder (NEW)
    ├── SKILL.md                   # Skill definition (loaded as prompt)
    └── create-worktree.sh         # Supporting file (included in response)
```

## Scope

**Files are REST API + CLI only.** MCP clients receive prompt text directly through the protocol and do not materialize files on disk. The `files` field is only meaningful for REST API consumers (the CLI) that write skill folders to the user's filesystem.

**MCP visibility rule:** Skill folders with only `SKILL.md` (no supporting files) are treated as regular prompts and served via both MCP and REST. Skill folders with `SKILL.md` + supporting files are **excluded from MCP entirely** — not listed in `prompts/list`, not retrievable via `prompts/get`. Rationale: if a skill depends on supporting files that MCP can't deliver, showing it to MCP clients is misleading — the skill won't work.

- **In scope**: Server-side prompt loading, REST API response, CLI skill generation, MCP filtering of file-dependent skills
- **Out of scope**: MCP file delivery (MCP never receives `files` field)

## Architecture

### Data Flow

```
Git repo ──clone──▶ user-prompts-loader
                        ├── flat .md files ──────────────▶ Prompt (existing)
                        ├── dirs with SKILL.md only ─────▶ Prompt (no files[], like flat .md)
                        └── dirs with SKILL.md + files ──▶ Prompt + files[] (REST-only)
                                                              │
                    MCP prompts/list ◀────── filters out prompts with files[]
                    MCP prompts/get  ◀────── rejects prompts with files[]
                                                              │
                    GET /api/v1/prompts ◀─────────────────────┘ (list includes all)
                    POST /api/v1/prompts/:name ◀──────────────┘ (response includes files)
                                                              │
                    CLI: dot-ai skills generate ◀─────────────┘ (writes SKILL.md + files)
```

### Interface Changes

**`Prompt` interface** (`src/tools/prompts.ts`):
```typescript
export interface PromptFile {
  path: string;       // Relative path within skill folder (e.g., "create-worktree.sh")
  content: string;    // Base64-encoded file content
}

export interface Prompt {
  name: string;
  description: string;
  content: string;
  arguments?: PromptArgument[];
  source: 'built-in' | 'user';
  files?: PromptFile[];  // NEW: supporting files for folder-based skills
}
```

**Prompts list response** — no change needed (files not included in list, only in get).

**Prompts get response** — add optional `files` field:
```json
{
  "success": true,
  "data": {
    "description": "Create a git worktree for PRD work",
    "messages": [{ "role": "user", "content": { "type": "text", "text": "..." } }],
    "files": [
      { "path": "create-worktree.sh", "content": "IyEvYmluL2Jhc2g..." }
    ]
  }
}
```

### Key Design Decisions

1. **Same endpoint, extended response**: No new API endpoints. The existing `POST /api/v1/prompts/:name` response gets an optional `files` field. Backward-compatible — clients that don't know about `files` simply ignore it.

2. **Base64 encoding for files**: Supporting files may contain binary content or characters that don't serialize well in JSON. Base64 is safe and universally supported.

3. **SKILL.md naming convention**: A directory is treated as a skill folder if and only if it contains a `SKILL.md` file. This is explicit and avoids ambiguity with other directories (e.g., `.git`).

4. **Skill name derived from directory name**: The directory name becomes the prompt/skill name (e.g., `worktree-prd/SKILL.md` → prompt name `worktree-prd`). The `name` field in SKILL.md frontmatter overrides this if present.

5. **No recursive scanning**: Only scan one level deep for skill folders. Nested directories within a skill folder are included as files but we don't look for nested SKILL.md files.

6. **File size limit**: Individual files within a skill folder are limited to **5 MB** (before base64 encoding). Files exceeding this limit are skipped with a warning log. This prevents bloated JSON responses while covering all practical use cases (scripts, templates, manifests). For larger assets, skill authors should use a bootstrap script that downloads them at runtime.

7. **File permissions are a CLI concern**: The server serves raw file content without tracking permissions. The CLI companion PRD (see Milestones) will handle setting executable permissions when writing files to disk (e.g., based on shebang or file extension).

8. **MCP excludes file-dependent skills**: A skill folder with only `SKILL.md` (no supporting files) is treated identically to a flat `.md` prompt — served via both MCP and REST. A skill folder with `SKILL.md` + supporting files is excluded from MCP `prompts/list` and `prompts/get` entirely, since MCP cannot deliver the files needed for the skill to function. This means the MCP handler must filter based on the presence of `files[]`.

9. **No "skill" vs "prompt" distinction in the data model**: Everything remains a `Prompt` in the internal model. The `PromptFile` type and `files[]` field are just interface additions created as part of the loader work — not a standalone deliverable. The "prompt" vs "skill" distinction is purely a consumer concern: MCP serves prompts, the CLI writes skill folders.

## Success Criteria

- Flat `.md` prompts continue to work identically (no regression)
- Skill folders with `SKILL.md` are discovered and served as prompts
- Skill folders with only `SKILL.md` (no supporting files) are served via both MCP and REST
- Skill folders with `SKILL.md` + supporting files are served via REST only (excluded from MCP)
- REST API `POST /api/v1/prompts/:name` includes `files` in response for file-dependent skills
- MCP `prompts/list` and `prompts/get` exclude skills that have supporting files
- Collision detection works for skill folders (built-in takes precedence)

## Milestones

- [x] Extend loader to scan for skill folders (directories containing `SKILL.md`), load supporting files as base64, and attach as `files[]` on the `Prompt` object (includes adding `PromptFile` type and `files` field to the `Prompt` interface)
- [x] Update REST API: add `files` field to prompts get response schema and pass through files data from loader
- [ ] Update MCP handler to filter out prompts with `files[]` from `prompts/list` and `prompts/get`
- [ ] Integration tests for MCP filtering and collision detection (list/get/files tests done)
- [ ] Create PRD in `dot-ai-cli` repo for CLI-side changes:
  - `skills generate` fetches and writes full folder structures (SKILL.md + supporting files)
  - Decode base64 file content and write to disk
  - Set executable permissions on scripts (detect via shebang `#!/` or extension `.sh`, `.bash`)
