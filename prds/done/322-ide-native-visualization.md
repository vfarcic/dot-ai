# PRD: Native Visualization in AI Agents

**Issue**: [#322](https://github.com/vfarcic/dot-ai/issues/322)
**Status**: Closed - Superseded
**Priority**: Low
**Created**: 2025-01-05
**Closed**: 2026-01-19

## Problem Statement

MCP tools currently output web UI links for visualization (e.g., cluster topology, resource relationships). This requires users to leave their agent environment and open a browser - a suboptimal experience regardless of agent type.

**The ideal experience**: Visualizations render directly within the agent interface, without browser navigation.

IDE-based agents (Cursor, Windsurf, etc.) are more likely to enable this sooner due to richer rendering capabilities, but the problem affects all agents equally:
- Terminal-based agents (Claude Code)
- IDE-based agents (Cursor, Windsurf, Cody)
- Web-based agents (ChatGPT, Claude.ai)

## Research Findings

### Current MCP Ecosystem State (January 2025)

#### MCP Resources Support

| Client | Tools | Resources | Resource Rendering |
|--------|-------|-----------|-------------------|
| Claude Desktop | Yes | Partial | Limited (<1MB, buggy) |
| Cursor | Yes | No | N/A |
| Claude Code | Yes | No | N/A |
| MCP Apps hosts | Yes | Yes | HTML via iframe |

**Key Limitations Discovered:**
- **Cursor**: Only supports MCP tools, not resources. Resource support planned but not implemented.
- **Claude Desktop**: Has 1MB hard limit on resource content. Images work but are problematic with larger files. Stack size errors reported.
- **Claude Code**: No resource support.

Sources:
- [MCP Resources Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [Cursor MCP Resource Feature Request](https://forum.cursor.com/t/cursor-mcp-resource-feature-support/50987)
- [Claude Desktop Image Issues](https://github.com/modelcontextprotocol/python-sdk/issues/771)

#### MCP Apps Extension (November 2025)

The MCP Apps Extension introduces a `ui://` URI scheme for HTML-based interactive UIs rendered in sandboxed iframes.

**Adopted by**: Postman, Shopify, Hugging Face, Goose, ElevenLabs

**Concerns Identified:**
- Iframe is a web workaround, not a native solution
- UX fragmentation (theme mismatch, different interaction patterns)
- Security complexity (sandboxing, CSP, postMessage protocols)
- Performance overhead for simple visualizations
- Not truly portable (assumes web rendering capability)
- Feels like embedding a mini browser rather than native rendering

Source: [MCP Apps Blog Post](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/)

### Potential Approaches Evaluated

#### 1. Mermaid Diagrams in Response

Return Mermaid code in markdown, hope agent renders it.

**Reality**: Most agent chat panels do NOT render Mermaid natively. Would show as code block.

**Verdict**: Not viable without agent-side improvements.

#### 2. Save to File + Open Preview

```typescript
const content = `# Topology\n\n\`\`\`mermaid\n${diagram}\n\`\`\``;
fs.writeFileSync('./tmp/topology.md', content);
// Agent opens file, user triggers markdown preview
```

**Pros**: Works with IDE markdown preview + Mermaid extensions
**Cons**: File clutter, requires user action, still not inline

#### 3. Server-Side SVG Generation

```typescript
const svg = await renderMermaidToSVG(diagram);
return {
  image: `data:image/svg+xml;base64,${...}`,
  fallbackUrl: webUiLink
};
```

**Pros**: Images might render in some chat panels
**Cons**: Adds dependency, loses interactivity, may hit size limits, inconsistent support

#### 4. Local HTML Viewer

```typescript
const html = `<!DOCTYPE html>...`;
fs.writeFileSync('./tmp/visualization.html', html);
// Agent opens: open ./tmp/visualization.html
```

**Pros**: Full interactivity, works offline, local file
**Cons**: Still opens separate window (browser), not inline

#### 5. Multi-Format Response

```typescript
return {
  text: asciiDiagram,           // Universal fallback
  image: svgDataUrl,            // For agents that render images
  url: webUiLink,               // For full interactivity
  mermaid: mermaidCode          // Raw data for capable agents
};
```

**Pros**: Agents choose best format for their capabilities
**Cons**: Requires agent-side logic, adds complexity

#### 6. Declarative Visualization Format

```json
{
  "visualization": {
    "type": "graph",
    "nodes": [{"id": "pod-1", "label": "nginx"}],
    "edges": [{"from": "svc-1", "to": "pod-1"}]
  }
}
```

**Pros**: Let each agent render natively however it wants
**Cons**: No standard exists, would require ecosystem-wide adoption

### Summary Assessment

| Approach | Truly Inline | Universal | Effort |
|----------|--------------|-----------|--------|
| Web UI links (current) | No | Yes | None |
| Save file + preview | No | Partial | Low |
| Server SVG | Maybe | No | Medium |
| Local HTML | No | Yes | Low |
| Multi-format | Depends on agent | Yes | Medium |
| Declarative format | Yes (if adopted) | No (no standard) | High |
| MCP Apps (iframe) | Partial | No | High |

**Core insight**: No approach currently enables truly inline visualization across agents. This is fundamentally an agent/host capability gap, not something MCP servers can solve alone.

## What Would Actually Solve This

The real solution requires agent-side changes:

1. **Agents need native visualization rendering** - built into their chat/response panels
2. **A standard format for visualization data** - so MCP servers can provide structured data that agents render
3. **Or SVG/image rendering in responses** - at minimum, inline image support in agent responses

Until agents support this, MCP servers can only provide:
- Links (current approach)
- Text-based alternatives (ASCII diagrams)
- Multiple formats hoping one works

## Open Questions

1. Will IDE-based agents add native visualization rendering?
2. Is there momentum toward a standard visualization interchange format?
3. Should we engage with agent developers (Cursor, Claude Code) to advocate for this?
4. Would ASCII diagrams for simple cases reduce the pain enough to matter?

## Milestones (If Implemented)

- [ ] Milestone 1: Add ASCII diagram output for simple topology queries
- [ ] Milestone 2: Implement multi-format response (text + image + link)
- [ ] Milestone 3: Monitor and integrate with agent visualization capabilities as they emerge
- [ ] Milestone 4: Documentation for visualization options

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-05 | PRD created for future evaluation | Research complete, solution depends on agent ecosystem evolution |
| 2026-01-19 | PRD closed - Superseded | Web UI links remain the solution, complemented by a dedicated UI dashboard that integrates all tools with additional features. The dashboard provides a better visualization experience than attempting inline agent rendering. |

## References

- [MCP Resources Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [MCP Apps Extension Blog Post](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/)
- [Cursor MCP Resource Feature Request](https://forum.cursor.com/t/cursor-mcp-resource-feature-support/50987)
- [Claude Desktop Image Issues](https://github.com/modelcontextprotocol/python-sdk/issues/771)
- [Returning Images Discussion](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1204)
