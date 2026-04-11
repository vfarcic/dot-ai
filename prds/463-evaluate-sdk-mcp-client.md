# PRD #463: Evaluate SDK MCP Client for Consuming External MCP Tool Servers

## Status: Draft
## Priority: Low
## Created: 2026-04-11

## Problem

dot-ai is an MCP server but cannot consume tools from other MCP servers. The Vercel AI SDK provides `experimental_createMCPClient` for connecting to external MCP servers and using their tools.

## Solution

Evaluate whether consuming external MCP servers as tool sources would enable useful integrations:
- CI/CD MCP servers (GitHub Actions, ArgoCD)
- Monitoring MCP servers (Prometheus, Grafana)
- Cloud provider MCP servers
- Other DevOps tool MCP servers

Key considerations:
- `experimental_` prefix — API may change
- Adds complexity to the tool discovery and execution pipeline
- Security implications of connecting to external MCP servers
- Would this create MCP-server-to-MCP-server chains that are hard to debug?
- Users can already compose tools through their MCP client — is server-side composition needed?

## Success Criteria

- Clear assessment of external MCP consumption value
- If adopted: at least one useful external MCP integration working
- If rejected: documented reasoning for closure

## Milestones

- [ ] Survey available MCP servers in the DevOps ecosystem
- [ ] Prototype connecting to one external MCP server
- [ ] Evaluate value vs. complexity of server-side MCP composition
- [ ] Decide go/no-go based on evaluation
- [ ] If go: implement external MCP tool integration
- [ ] Integration tests passing
