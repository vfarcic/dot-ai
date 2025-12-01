# PRD #241: Anonymous Opt-in Analytics

## Status: Closed (Superseded)
## Priority: Medium
## Created: 2025-12-01
## Closed: 2025-12-01

---

## Problem Statement

Currently, there is no visibility into how users interact with dot-ai tools, making it difficult to:
- **Prioritize development work**: Which tools are most used? Which need improvement?
- **Identify issues**: Which features have high failure rates?
- **Understand workflows**: How do users chain tools together?
- **Measure adoption**: Is usage growing? Which features gain traction?

Without this data, development decisions are based on assumptions rather than evidence.

## Solution Overview

Implement **opt-in, anonymous analytics** that tracks tool usage patterns and feature adoption while respecting user privacy:

### Core Principles
1. **Opt-in only**: Analytics disabled by default, requires explicit user action
2. **Anonymous**: No PII, no user tracking, aggregate metrics only
3. **Discoverable**: Users are informed about the option without being nagged
4. **Transparent**: Clear documentation of what's collected and why

### Configuration Methods
- **Environment variable**: `DOT_AI_ANALYTICS=true`
- **Config file**: `~/.dot-ai/config.json` with `{ "analytics": true }`

### Discoverability Mechanisms
1. **One-time soft hint**: First tool response includes non-blocking suggestion (shows once, then never again)
2. **Version output**: `version` tool shows analytics status and opt-in instructions
3. **Documentation**: Prominent mention in setup guides and README

## Success Criteria

1. **Opt-in mechanism works**: Users can enable analytics via env var or config file
2. **Data is anonymous**: No PII or identifying information in any collected data
3. **Discoverability achieved**: First-use hint shown once; version output includes analytics status
4. **Metrics collected**: Tool usage, success/failure rates, timing data captured
5. **Data accessible**: Analytics data viewable for product decisions
6. **No user complaints**: Opt-in approach respected, no privacy concerns raised
7. **Documentation complete**: Clear docs on what's collected and how to enable

## Technical Analysis

### What to Collect (Anonymous Metrics)

| Category | Metrics | Privacy Notes |
|----------|---------|---------------|
| Tool Usage | Tool name, invocation count | No parameters or user input |
| Success Rate | Success/failure per tool | Error types only, no messages |
| Performance | Response times, latency | Aggregate only |
| Session Data | Tools per session, workflow patterns | No session IDs |
| Feature Adoption | Which capabilities used | Counts only |
| AI Model Usage | Which models invoked | Provider name only |

### What NOT to Collect

- User intents or prompts
- Resource names, cluster names, namespace names
- API keys or credentials
- IP addresses or geolocation
- Any personally identifiable information
- Actual error messages (only error categories)

### Analytics Backend Options

| Option | Pros | Cons |
|--------|------|------|
| **PostHog** | Open source, self-hostable, good privacy | External service |
| **Plausible** | Privacy-focused, simple | Less feature-rich |
| **Self-hosted Qdrant** | Already in stack, full control | Need to build dashboard |
| **Simple file/API** | Full control, minimal deps | Need to build everything |

**Recommendation**: Evaluate PostHog first (privacy-focused, self-hostable), with self-hosted fallback option.

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool Invocation                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Analytics Middleware                            │
│  - Check if analytics enabled (env var / config)            │
│  - Extract anonymous metrics                                 │
│  - Queue for async send                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Analytics Backend                               │
│  - Receive events asynchronously                             │
│  - Store aggregate data                                      │
│  - Provide dashboard/API                                     │
└─────────────────────────────────────────────────────────────┘
```

### First-Use Hint Behavior

```typescript
// Pseudo-code for first-use detection
const CONFIG_PATH = '~/.dot-ai/config.json';

function shouldShowHint(): boolean {
  const config = loadConfig(CONFIG_PATH);
  if (config.analyticsHintShown) return false;
  if (config.analytics !== undefined) return false; // Already configured
  return true;
}

function markHintShown(): void {
  const config = loadConfig(CONFIG_PATH);
  config.analyticsHintShown = true;
  saveConfig(CONFIG_PATH, config);
}
```

### Version Output Enhancement

```
dot-ai v1.x.x
Health: OK
Analytics: disabled (opt-in with DOT_AI_ANALYTICS=true)
```

or when enabled:

```
dot-ai v1.x.x
Health: OK
Analytics: enabled (anonymous usage data)
```

## Out of Scope

- User tracking or identification
- A/B testing infrastructure
- Real-time analytics dashboards (initial version)
- Integration with external analytics platforms beyond chosen backend
- Crash reporting with stack traces (privacy concern)

## Dependencies

- Config file infrastructure (may need to create `~/.dot-ai/` directory handling)
- Decision on analytics backend (PostHog vs self-hosted)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low opt-in rate | Medium | High | Good discoverability, clear value proposition |
| Privacy concerns | Low | High | Anonymous-only design, clear documentation |
| Backend reliability | Low | Medium | Async send, graceful failure |
| Performance impact | Low | Low | Async, non-blocking design |

---

## Milestones

### Milestone 1: Configuration Infrastructure
- [ ] Create config file handling (`~/.dot-ai/config.json`)
- [ ] Implement environment variable check (`DOT_AI_ANALYTICS`)
- [ ] Add analytics status to `version` tool output
- [ ] Integration tests for configuration detection

### Milestone 2: Analytics Collection Layer
- [ ] Design anonymous event schema
- [ ] Implement analytics middleware for tool invocations
- [ ] Add async event queuing (non-blocking)
- [ ] Ensure no PII in collected data
- [ ] Integration tests for event collection

### Milestone 3: First-Use Discoverability
- [ ] Implement first-use hint detection
- [ ] Add one-time soft hint to tool responses
- [ ] Track hint-shown state in config file
- [ ] Integration tests for hint behavior

### Milestone 4: Analytics Backend Integration
- [ ] Evaluate and select backend (PostHog vs alternatives)
- [ ] Implement event sending to backend
- [ ] Set up basic analytics dashboard
- [ ] Integration tests for end-to-end flow

### Milestone 5: Documentation and Launch
- [ ] Document opt-in process in README
- [ ] Add analytics section to setup guides
- [ ] Document what data is collected (transparency)
- [ ] Update CLAUDE.md if needed

---

## Progress Log

### 2025-12-01 - PRD Created
- Discussed opt-in vs opt-out approach (chose opt-in for trust)
- Confirmed anonymous-only data collection (no PII)
- Evaluated first-run wizard - not supported by MCP spec
- Decided on env var + config file for configuration
- Planned discoverability: one-time hint + version output + docs
- Created GitHub issue #241

### 2025-12-01 - PRD Closed (Superseded by #245)
**Duration**: N/A (administrative closure)
**Status**: Closed

**Closure Summary**:
This PRD proposed building a comprehensive analytics infrastructure with backend services (PostHog), middleware, config file handling, and dashboards. After further discussion, a simpler approach was chosen.

**Replacement**: PRD #245 (User Feedback Collection via Google Forms)

**Why Superseded**:
The Google Forms approach achieves similar goals with significantly less complexity:

| This PRD (#241) | Replacement (#245) |
|-----------------|-------------------|
| Build analytics backend (PostHog) | Use Google Forms (no backend) |
| Automated metrics collection | User-initiated feedback |
| Complex middleware layer | Simple link in responses |
| Config file infrastructure | Environment variables only |
| High implementation effort | Minimal implementation |

**Key Insight**: Google Forms provides 80% of the value with 10% of the effort. Users can provide both quantitative (ratings) and qualitative (free text) feedback without building infrastructure.
