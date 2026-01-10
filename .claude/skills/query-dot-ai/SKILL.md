---
name: query-dot-ai
description: "Query sibling dot-ai projects to verify features are USABLE (not just defined). IMPORTANT: When calling this skill, explain HOW you plan to use the feature (e.g., 'I need to call X via REST API from the UI' or 'I need to import Y function'). This helps verify the full chain from definition to exposure."
context: fork
agent: Explore
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(grep:*)
---

# Query dot-ai Projects

Explore the dot-ai ecosystem codebases to find the requested information.

## Project Locations

Sibling projects are located in the parent directory of the current working directory (`../`):

- **dot-ai** - Main MCP server (API endpoints, tools, handlers)
- **dot-ai-ui** - Web UI for visualizations and dashboard
- **dot-ai-controller** - Kubernetes controller
- **dot-ai-stack** - Stack deployment configs
- **dot-ai-website** - Documentation website

Default to **dot-ai** (MCP server) if the target project is unclear.

**Important:** Do NOT use this skill to query the project you're currently working in. Use local tools (Read, Grep, Glob) instead.

## Excluded

**dot-ai-infra** - Production infrastructure. Only query if user explicitly requests it.

## Verification Mindset

**Don't just find that something EXISTS - prove it's USABLE.**

- Finding a type/interface is NOT enough
- Finding internal code is NOT enough
- You must trace from definition → implementation → exposure

When asked "does X exist?", answer:
- "Yes, and here's how to use it: [concrete usage]" OR
- "It exists internally but is NOT exposed for external use"

**Go deep, not wide.** Follow the code path until you can prove how the caller would actually use the feature.
