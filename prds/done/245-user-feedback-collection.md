# PRD #245: User Feedback Collection via Google Forms

## Status: Complete
## Priority: Medium
## Created: 2025-12-01

---

## Problem Statement

Currently, there is no visibility into how users interact with dot-ai tools, making it difficult to:
- **Prioritize development work**: Which tools are most used? Which need improvement?
- **Understand user satisfaction**: How useful are the tools in practice?
- **Gather improvement ideas**: What features or enhancements do users want?
- **Identify pain points**: What frustrations do users experience?

Without this feedback, product decisions rely on assumptions rather than direct user input.

## Solution Overview

Implement a **lightweight feedback collection system** using Google Forms, presented to users at the end of tool workflows:

### Why Google Forms (vs. Building Analytics Infrastructure)

| Approach | Pros | Cons |
|----------|------|------|
| **Google Forms** | No backend needed, questions changeable without releases, free, reliable, built-in analysis | Requires user action, lower volume |
| **Custom Analytics** | Automated, high volume | Needs backend, maintenance, privacy complexity |

**Decision**: Google Forms provides 80% of the value with 10% of the effort. Can always add automated analytics later if needed.

### Core Principles
1. **Non-intrusive**: Appears only ~5% of the time (configurable)
2. **Opt-out available**: Users can disable feedback prompts entirely
3. **External form**: Google Forms handles questions, responses, and analysis
4. **No code changes for questions**: Form can be updated without new releases
5. **Minimal implementation**: Just a message with a link in tool responses

### How It Works

```
User runs tool → Tool completes workflow → 5% chance → Show feedback message
                                        → 95% chance → Normal response only
```

**Feedback message example:**
```
---
Help us improve dot-ai: [Google Form Link]
(Disable: DOT_AI_FEEDBACK_ENABLED=false)
```

## Success Criteria

1. **Feedback prompts appear**: ~5% of completed workflows show feedback message
2. **Opt-out works**: Setting `DOT_AI_FEEDBACK_ENABLED=false` disables prompts
3. **Probability configurable**: `DOT_AI_FEEDBACK_PROBABILITY` adjusts frequency
4. **Form receives responses**: Users successfully submit feedback via the form
5. **Non-blocking**: Feedback message doesn't affect tool functionality
6. **Consistent across tools**: All tools participate at workflow completion

## Technical Analysis

### Configuration via Environment Variables

Following existing patterns (e.g., `OTEL_TRACING_ENABLED`, `DOT_AI_DEBUG`):

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DOT_AI_FEEDBACK_ENABLED` | boolean | `true` | Enable/disable feedback prompts |
| `DOT_AI_FEEDBACK_PROBABILITY` | float | `0.05` | Probability of showing prompt (0.0-1.0) |
| `DOT_AI_FEEDBACK_URL` | string | (hardcoded default) | Google Form URL |

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool Completes Workflow                   │
│  (recommend deploys, operate executes, remediate resolves)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Feedback Decision Logic                         │
│  1. Check DOT_AI_FEEDBACK_ENABLED (default: true)           │
│  2. Generate random number                                   │
│  3. Compare against DOT_AI_FEEDBACK_PROBABILITY (0.05)       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
         Show prompt                     No prompt
              │                               │
              ▼                               ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│ Append feedback message │    │   Normal tool response  │
│ with Google Form link   │    │                         │
└─────────────────────────┘    └─────────────────────────┘
```

### Code Location

Create a shared utility that tools can call at workflow completion:

```typescript
// src/core/feedback.ts

export interface FeedbackConfig {
  enabled: boolean;
  probability: number;
  formUrl: string;
}

export function loadFeedbackConfig(): FeedbackConfig {
  return {
    enabled: process.env.DOT_AI_FEEDBACK_ENABLED?.toLowerCase() !== 'false',
    probability: parseFloat(process.env.DOT_AI_FEEDBACK_PROBABILITY || '0.05'),
    formUrl: process.env.DOT_AI_FEEDBACK_URL || 'https://forms.gle/XXXXXXXXXX'
  };
}

export function shouldShowFeedback(config: FeedbackConfig): boolean {
  if (!config.enabled) return false;
  return Math.random() < config.probability;
}

export function getFeedbackMessage(config: FeedbackConfig): string {
  return `\n---\nHelp us improve dot-ai: ${config.formUrl}\n(Disable: DOT_AI_FEEDBACK_ENABLED=false)`;
}
```

### Integration Points

Tools that should include feedback prompts (at workflow completion only):

| Tool | Trigger Point |
|------|---------------|
| `recommend` | After `generateManifests` stage completes (core value delivery) |
| `operate` | After `executeChoice` completes successfully |
| `remediate` | After `executeChoice` completes successfully |
| `manageOrgData` | After pattern/policy creation completes successfully |
| `projectSetup` | After `generateScope` completes all files |

### Google Form Design (External)

Initial suggested questions (managed in Google Forms, not in code):

1. **How useful was this interaction?** (1-5 rating)
2. **Which dot-ai tools do you use?** (multi-select: recommend, operate, remediate, manageOrgData, projectSetup, version)
3. **What would you improve?** (free text)
4. **Any other feedback?** (free text, optional)

Form can be updated anytime without code changes.

## Out of Scope

- Building custom analytics infrastructure
- Automated usage tracking
- In-app questionnaire UI
- Response analysis/dashboard (Google Forms handles this)
- Automated sentiment analysis

## Dependencies

- Google Form created and URL available
- Decision on exact form questions (can be adjusted after launch)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low response rate | Medium | Medium | Keep form short, 5% not too frequent |
| User annoyance | Low | Medium | Easy opt-out, low frequency |
| Form URL changes | Low | Low | URL configurable via env var |
| Spam responses | Low | Low | Google Forms has built-in protection |

---

## Milestones

### Milestone 1: Core Feedback Infrastructure
- [x] Create feedback configuration module (`src/core/feedback.ts`)
- [x] Implement environment variable loading with defaults
- [x] Add probability-based decision logic
- [x] Integration tests for configuration and probability logic

### Milestone 2: Tool Integration
- [x] Add feedback prompt to `version` tool (single-stage, used for testing)
- [x] Add feedback prompt to `recommend` tool (generateManifests stage)
- [x] Add feedback prompt to `operate` tool (executeChoice)
- [x] Add feedback prompt to `remediate` tool (executeChoice)
- [x] Add feedback prompt to `manageOrgData` tool (pattern/policy creation completion)
- [x] Add feedback prompt to `projectSetup` tool (generateScope completion)
- [x] Integration tests verifying prompts appear at correct workflow stages

### Milestone 3: Google Form & Documentation
- [x] Create Google Form with initial questions
- [x] Configure form response notifications
- [x] Update default URL in code
- [x] Document feedback configuration in README and setup guide
- [x] Update CLAUDE.md if new patterns introduced

---

## Progress Log

### 2025-12-03 - PRD Complete
- Added `DOT_AI_FEEDBACK_ENABLED` to setup guide configuration table (`docs/mcp-setup.md`)
- Added "Help Us Improve" call to action section in README with direct form link
- Added feedback form link to GitHub issue template chooser (`.github/ISSUE_TEMPLATE/config.yml`)
- Configured Google Form email notifications for new responses
- Kept documentation minimal: only documented opt-out variable, not probability/URL (internal use)

### 2025-12-02 - Milestone 2 Complete: All Tools Integrated
- Added feedback integration to all remaining tools:
  - `recommend` (generateManifests stage) - `src/tools/generate-manifests.ts`
  - `operate` (executeChoice) - `src/tools/operate-execution.ts`
  - `remediate` (executeChoice) - `src/tools/remediate.ts`
  - `manageOrgData` (pattern/policy creation) - `src/core/pattern-operations.ts`, `src/core/policy-operations.ts`
  - `projectSetup` (generateScope) - `src/tools/project-setup/generate-scope.ts`
- Changed `recommend` trigger from `deployManifests` to `generateManifests` (deployManifests is optional; generateManifests is the core value delivery point)
- Updated PRD Integration Points table to reflect correct trigger points
- All tools use `maybeGetFeedbackMessage()` helper with consistent pattern
- Build verified successful

### 2025-12-02 - Milestone 1 Complete, Milestone 2 & 3 Partially Complete
- Created `src/core/feedback.ts` with configuration loading and probability logic
- Implemented environment variable support: `DOT_AI_FEEDBACK_ENABLED`, `DOT_AI_FEEDBACK_PROBABILITY`, `DOT_AI_FEEDBACK_URL`
- Added decorated feedback message with visual separator for prominence
- Integrated feedback into `version` tool (added as `message` field in JSON response)
- Created Google Form: https://forms.gle/dJcDXtsxhCCwgxtT6
- Updated CLAUDE.md with form URL and reminder to update form when adding new tools/prompts
- Created integration test (`tests/integration/tools/feedback.test.ts`) with statistical verification (200 iterations)
- Exported feedback functions from `src/core/index.ts`

### 2025-12-01 - PRD Created
- Decided on Google Forms approach (simpler than building analytics infrastructure)
- 5% random probability, configurable via environment variable
- Using environment variables for configuration (matching existing patterns)
- Replaces PRD #241 (Anonymous Analytics) - simpler approach achieves similar goals
- Created GitHub issue #245
