# PRD: Documentation Testing Guidance System

**GitHub Issue**: [#32](https://github.com/vfarcic/dot-ai/issues/32)  
**Status**: Draft  
**Priority**: Low  
**Start Date**: 2025-01-23  
**Target Completion**: TBD  

## Overview

Enhance documentation testing capabilities by adding structured `dotai-test` comments that provide testing guidance to client agents, enabling safe and comprehensive testing of interactive documentation content.

## Problem Statement

Documentation testing agents currently face challenges when encountering interactive examples:

- **Missed Testing Opportunities**: Agents skip testable content because they don't know it's safe to test
- **Unsafe Test Execution**: Agents might attempt to test examples that could cause real side effects  
- **Inconsistent Testing**: Different agents make different assumptions about what can be tested
- **Limited Test Coverage**: Interactive workflows (like MCP conversational examples) are often untested

This leads to documentation that may contain inaccurate interactive examples, reducing user trust and success rates.

## Success Criteria

**Primary Goals:**
- Documentation testing agents can safely test interactive examples
- Improved test coverage for conversational and workflow documentation
- Clear guidance system for complex testing scenarios
- Reduced manual validation overhead for interactive content

**Quality Gates:**
- All interactive examples have appropriate testing guidance
- Documentation testing tool recognizes and acts on guidance comments
- No unsafe testing attempts on potentially destructive examples

## Implementation Milestones

### Phase 1: Comment Format Design
- [ ] **Define `dotai-test` comment syntax** - Create structured comment format for testing guidance with examples and standards

### Phase 2: Tool Integration  
- [ ] **Enhance documentation testing tool** - Update `mcp__dot-ai__testDocs` to recognize and process `dotai-test` comments
- [ ] **Add guidance processing logic** - Implement logic to parse and act on different types of testing guidance

### Phase 3: Documentation Enhancement
- [ ] **Add guidance comments to existing docs** - Review current documentation and add appropriate `dotai-test` comments where needed
- [ ] **Validate improved testing coverage** - Confirm that interactive examples are now being tested appropriately

## Technical Approach

**Core Strategy:**
- Use structured HTML comments (`<!-- dotai-test: guidance -->`) for testing instructions
- Integrate guidance recognition into existing documentation testing workflow
- Support multiple guidance types: safe testing, mock requirements, skip instructions

**Example Implementation:**
```markdown
<!-- dotai-test: MCP server configured - test this workflow using recommend tool -->
**Example: Kubernetes Deployment**
User: I want to deploy a web application
Agent: [Uses recommend tool to provide deployment guidance]
```

**Guidance Types:**
- **Safe testing**: Examples that can be tested directly
- **Mock requirements**: Examples requiring specific setup or mocks
- **Skip instructions**: Examples that should not be tested due to side effects

## Risk Assessment

### Technical Risks
- **🟡 Medium: Comment format complexity** - Complex syntax might be hard to maintain
  - *Mitigation*: Keep syntax simple and well-documented
  - *Testing*: Validate comment parsing with various formats

- **🟢 Low: Tool integration difficulty** - Existing testing tool is extensible
  - *Mitigation*: Build on existing comment processing patterns (dotai-ignore)

### Business Risks
- **🟢 Low: Adoption overhead** - Writers need to learn new comment format
- **🟢 Low: Maintenance burden** - Additional comments to maintain in documentation

## Dependencies

### Internal Dependencies
- **Existing documentation testing tool** - Must extend current `mcp__dot-ai__testDocs` functionality
- **Documentation content** - Need existing interactive examples to enhance with guidance

### External Dependencies
- **None identified** - This is enhancement to existing internal tooling

## Content Location Map

This PRD focuses on enhancing existing tooling and documentation:

### Files to Update
- Documentation testing tool code - Add `dotai-test` comment recognition
- Existing documentation files - Add guidance comments to interactive examples
- Testing tool documentation - Document new guidance comment format

### Files to Create
- Guidance format specification - Standard for `dotai-test` comment syntax
- Testing examples - Demonstrate various guidance types and usage patterns

## Decision Log

### 2025-01-23: Implementation Approach Decision
**Decision**: Use HTML comment format similar to existing `dotai-ignore` pattern  
**Rationale**: Consistency with existing comment-based guidance system  
**Impact**: Leverages familiar patterns and existing parsing infrastructure  

## Work Log

### 2025-01-23: PRD Creation
**Duration**: 20 minutes  
**Tasks Completed**:
- [x] Created GitHub issue #32
- [x] Created milestone-focused PRD document  
- [x] Identified core technical approach leveraging existing comment patterns
- [x] Defined three-phase implementation focusing on format → integration → adoption

**Next Session Priority**: Design `dotai-test` comment syntax and create specification with examples