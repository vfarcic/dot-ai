# PRD: Comprehensive Documentation Testing Mechanism

**Created**: 2025-07-19
**Status**: In Progress
**Owner**: Viktor Farcic
**Last Updated**: 2025-07-19

## Executive Summary
AI-powered documentation validation system that automatically executes commands, tests examples, and validates claims in documentation files to ensure accuracy and prevent documentation drift.

## Problem Statement
Documentation frequently becomes outdated and unreliable due to:
- Commands that no longer work as described
- Code examples that fail when users try them
- Instructions that skip crucial setup steps
- Claims about software behavior that become inaccurate over time
- Manual testing processes that are time-consuming and error-prone

This leads to user frustration, reduced adoption, and loss of credibility for documentation.

## Interface Requirements

This system provides dual interfaces with complete feature parity:
- **CLI Interface**: Command-line tool for direct user interaction
- **MCP Interface**: Model Context Protocol server for AI agent integration

All functionality, workflows, and capabilities described in this PRD must be implemented in both interfaces with identical behavior and feature sets.

## Proposed Solution
Comprehensive AI-driven testing system that:
- Automatically discovers and categorizes testable content in documentation
- Executes commands and examples in safe, isolated environments
- Validates both functional accuracy (does it work?) and semantic accuracy (are the descriptions truthful?)
- Provides structured feedback with actionable improvement recommendations
- Supports resumable, session-based workflows for large documentation sets
- Maintains detailed audit trails of testing results and changes

## User Stories & Use Cases
- As a **documentation maintainer**, I want automated validation of all examples so that I can catch outdated content before users encounter it
- As a **development team member**, I want documentation testing integrated into CI/CD so that code changes don't break documented examples
- As a **technical writer**, I want to understand which sections need updates so that I can prioritize my work effectively
- As a **open source maintainer**, I want confidence that my README and docs work for new contributors so that onboarding is smooth
- As a **product manager**, I want metrics on documentation quality so that I can track improvements over time

## Requirements Tracking

### Functional Requirements
- [x] **Session-based workflow management** - Create, resume, and track validation sessions
- [x] **Document structure discovery** - Automatically identify testable sections in documentation
- [x] **Section-by-section validation** - Process documents in manageable chunks with progress tracking
- [x] **Two-phase validation approach** - Combine functional testing (does it work) with semantic validation (is it accurate)
- [x] **Structured result format** - Generate machine-readable JSON results for analysis
- [x] **Automatic workflow progression** - Seamlessly move between sections without manual intervention
- [x] **Dual interface support** - Provide both CLI and MCP interfaces with feature parity
- [ ] **User-driven workflow selection** - Both CLI and MCP interfaces offer users choice of Test Only, Analyze Only, or Test & Analyze workflows at session creation, with intelligent prompting for missing file/mode selections
- [ ] **Document coherence analysis and fix application** - Assess overall document flow, consistency, and completeness, then apply user-selected improvements
- [ ] **Recursive documentation testing** - Follow links from initial document to test entire documentation ecosystems

### Non-Functional Requirements
- [x] **Performance**: Process individual sections efficiently (< 30 seconds per section)
- [x] **Scalability**: Handle documents with 20+ sections without degradation
- [x] **Reliability**: Maintain session state reliably across interruptions
- [x] **Usability**: Provide clear progress indicators and actionable feedback
- [x] **Maintainability**: Use file-based prompts for easy AI instruction updates
- [ ] **Integration**: Support CI/CD pipeline integration for automated testing
- [ ] **Configurability**: Allow customization of testing parameters and validation rules
- [ ] **Monitoring**: Provide metrics and reporting on documentation quality trends

### Success Criteria
- [x] **Comprehensive Coverage**: Execute all testable content in documentation sections
- [x] **Accurate Detection**: Identify both functional issues (broken commands) and semantic issues (inaccurate descriptions)
- [x] **Actionable Feedback**: Generate specific, implementable improvement recommendations
- [x] **Session Continuity**: Support resumable workflows for interrupted validation sessions
- [ ] **Quality Improvement**: Demonstrate measurable improvement in documentation accuracy over time
- [ ] **User Adoption**: Achieve regular usage by documentation maintainers and development teams

## Implementation Progress

### Phase 1: Core Architecture ✅ **COMPLETED** (2025-07-18)
**Target**: Foundation for all validation capabilities
- [x] Session-based architecture with unique IDs and persistence
- [x] Basic CLI interface implementation
- [x] MCP server interface implementation  
- [x] Shared validation engine (`handleTestDocsTool`)
- [x] Phase-driven workflow framework
- [x] Session directory management and utilities

### Phase 2: Prompt Development ✅ **COMPLETED** (2025-07-18)
**Target**: AI-powered content analysis and guidance
- [x] File-based prompt system with template variables
- [x] Scan phase prompt implementation
- [x] Dynamic workflow adaptation
- [x] Template variable validation and error handling

### Phase 3: Section-Based Refactor ✅ **COMPLETED** (2025-07-19)
**Target**: Granular document processing capabilities
- [x] Section-based type definitions and interfaces
- [x] DocumentSection and SectionTestResult interfaces
- [x] Flexible AI-driven content organization
- [x] Section-by-section workflow progression
- [x] Progress tracking and status management

### Phase 4: Enhanced Validation ✅ **COMPLETED** (2025-07-19)
**Target**: Comprehensive testing capabilities with automatic workflow
- [x] Complete CLI and MCP feature parity
- [x] Structured JSON result format implementation
- [x] Automatic workflow progression after result submission
- [x] Two-phase validation (functional + semantic)
- [x] Enhanced prompts with mandatory semantic analysis checklists
- [x] Comprehensive error handling and recovery
- [x] Bug fixes (CLI parameter handling, phase override logic)

### Phase 5: Document Coherence Analysis & Fix Application 🔄 **IN PROGRESS** (25% REMAINING)
**Target**: Document-level coherence assessment and user-driven fix application
- [ ] **Document coherence analysis**
  - [ ] Overall document flow and organization assessment
  - [ ] Cross-section consistency and terminology checking
  - [ ] Missing connections and gap identification
  - [ ] Document completeness evaluation
- [ ] **Fix application workflow**
  - [ ] Combined presentation of section-level and document-level issues
  - [ ] User selection interface for choosing fixes to apply
  - [ ] Automated fix application for selected improvements
  - [ ] Simple, single-pass document transformation
- [ ] **Performance & integration optimization**
  - [ ] Large document processing optimization
  - [ ] Concurrent validation features
  - [ ] CI/CD pipeline integration capabilities

### Phase 6: Documentation Graph Testing ⏳ **PROPOSED**
**Target**: Recursive validation of entire documentation ecosystems
- [ ] **Link Discovery and Classification**
  - [ ] Markdown link extraction and parsing
  - [ ] HTML link discovery in documentation
  - [ ] Internal vs external link classification
  - [ ] Documentation vs non-documentation link filtering
- [ ] **Recursive Validation Workflow**
  - [ ] Follow links from initial document to discover connected docs
  - [ ] Validate linked documents using same section-based approach
  - [ ] Build comprehensive ecosystem validation reports
- [ ] **Scope Control and Safety**
  - [ ] Repository boundary enforcement (same repo only by default)
  - [ ] Maximum depth limits (1-3 levels configurable)
  - [ ] Domain whitelist/blacklist functionality
  - [ ] Interactive confirmation for each new document discovered
  - [ ] Circular reference detection and prevention
  - [ ] Performance safeguards and timeout controls

## Technical Implementation Checklist

### Architecture & Design ✅ **COMPLETED**
- [x] TypeScript implementation with comprehensive type safety
- [x] Session-based state management using JSON persistence
- [x] Shared validation engine accessible via CLI and MCP interfaces
- [x] Comprehensive error handling and graceful failure modes
- [x] File-based prompt system following CLAUDE.md patterns

### Development Tasks ✅ **COMPLETED**
- [x] Core validation workflow implementation
- [x] Section discovery and management
- [x] Result processing and storage
- [x] Automatic workflow progression logic
- [x] Two-phase validation prompt structure

### Quality Assurance ✅ **COMPLETED**
- [x] Comprehensive test suite (558 tests across 25 suites)
- [x] Manual end-to-end testing validation
- [x] Feature parity verification between CLI and MCP interfaces
- [x] Performance validation for multi-section documents

## Dependencies & Blockers

### External Dependencies ✅ **RESOLVED**
- [x] Claude AI API integration for intelligent analysis
- [x] Git repository structure for session management
- [x] File system access for prompt template loading

### Internal Dependencies ✅ **COMPLETED**
- [x] Shared session management utilities
- [x] Error handling framework
- [x] MCP server infrastructure

### Current Blockers  
- [ ] **Document Coherence Analysis Prompts**: Need to develop prompts for assessing overall document flow and meaningfulness
- [ ] **Fix Selection and Application Interface**: Need to implement user interface for choosing which fixes to apply

## Risk Management

### Identified Risks
- [x] **Risk**: Complex prompts might be difficult to maintain | **Mitigation**: Use file-based prompt system with template variables | **Owner**: Development Team
- [x] **Risk**: Session state corruption could lose progress | **Mitigation**: Robust JSON persistence with error recovery | **Owner**: Development Team  
- [ ] **Risk**: Large documents could overwhelm system resources | **Mitigation**: Implement streaming and chunking for memory management | **Owner**: Development Team
- [ ] **Risk**: AI analysis quality could vary significantly | **Mitigation**: Develop validation metrics and feedback loops | **Owner**: Product Team

### Mitigation Actions
- [x] Implement comprehensive error handling throughout workflow
- [x] Create robust session state management with recovery capabilities
- [ ] Develop performance monitoring and optimization strategies
- [ ] Establish quality metrics for AI analysis effectiveness

## Decision Log

### Open Questions
- [ ] **Workflow Mode Implementation**: How should CLI parameters and MCP tool parameters handle mode selection and prompting? | **Target**: Phase 5 kickoff
- [ ] **Document Coherence Analysis Design**: What specific aspects of document flow and consistency should be evaluated? | **Target**: Phase 5 kickoff
- [ ] **CI/CD Integration Approach**: What's the best way to integrate with existing development workflows? | **Target**: Phase 5 planning

### Resolved Decisions
- [x] **Two-Phase Validation Approach** - **Decided**: 2025-07-19 **Rationale**: Functional testing alone missed semantic accuracy issues; combined approach provides comprehensive validation
- [x] **JSON Result Format** - **Decided**: 2025-07-19 **Rationale**: Structured data enables better analysis and processing in later phases compared to free-form text
- [x] **Automatic Workflow Progression** - **Decided**: 2025-07-19 **Rationale**: Manual CLI calls between sections created friction; automatic progression improves user experience
- [x] **File-based Prompt System** - **Decided**: 2025-07-18 **Rationale**: Separates AI instructions from code, enables easier prompt iteration and collaboration
- [x] **Simplified 4-Phase Workflow** - **Decided**: 2025-07-19 **Rationale**: SCAN → TEST → ANALYZE → FIX approach with document-level coherence analysis and user-driven fix selection is simpler and more practical than complex coordination systems
- [x] **User Workflow Selection at Session Creation** - **Decided**: 2025-07-20 **Rationale**: Users have different documentation validation needs - some only want functional testing, others only want structure review, others want comprehensive validation. Forcing all users through complete workflow reduces efficiency and user satisfaction
- [x] **Simplified Document Coherence Analysis** - **Decided**: 2025-07-20 **Rationale**: Original cross-section coordination and cascade prevention approach was over-engineered. Most documentation fixes are independent and don't create conflicts. Users prefer simple fix selection over complex coordination

## Scope Management

### In Scope (Current Version)
- [x] Single document validation with section-by-section processing
- [x] CLI and MCP interfaces with complete feature parity
- [x] Session-based workflow management with resumption capabilities
- [x] Two-phase validation (functional and semantic testing)
- [x] Structured result format for programmatic analysis
- [ ] Document coherence analysis for overall flow and consistency
- [ ] User-driven fix selection and application

### Out of Scope (Future Versions)
- [~] **Real-time collaboration** - Multiple users working on same validation session (Future)
- [~] **Visual documentation testing** - Screenshot comparison and UI validation (Future)
- [~] **Integration with specific documentation platforms** - Direct integration with GitBook, Confluence, etc. (Future)
- [~] **Advanced analytics dashboard** - Quality metrics trending and visualization (Future)

### Deferred Items
- [~] **Performance optimization for 100+ sections** - **Reason**: Current performance adequate for typical use cases **Target**: Phase 6
- [~] **Advanced caching mechanisms** - **Reason**: File-based session storage sufficient for current needs **Target**: Future enhancement
- [~] **Distributed validation** - **Reason**: Single-machine processing meets current requirements **Target**: Scale-driven future enhancement

## Testing & Validation

### Test Coverage Requirements ✅ **COMPLETED**
- [x] **Unit test coverage**: 558 tests across 25 suites with comprehensive coverage
- [x] **Integration test scenarios**: CLI and MCP interface integration validation
- [x] **End-to-end test cases**: Complete workflow testing from scan through test phases
- [x] **Performance test benchmarks**: Multi-section document processing validation

### User Acceptance Testing ✅ **COMPLETED**
- [x] **Manual workflow testing**: Complete end-to-end validation through all 7 sections
- [x] **Bug identification and resolution**: CLI parameter handling and phase override issues resolved
- [x] **Feature parity validation**: Confirmed identical functionality between CLI and MCP interfaces

## Documentation & Communication

### Documentation Tasks ✅ **COMPLETED**
- [x] **CLAUDE.md updates**: Project instructions updated with testing workflow and mandatory requirements
- [x] **CLI help documentation**: Complete command documentation with examples
- [x] **MCP tool integration**: Comprehensive tool descriptions and parameter documentation
- [x] **Prompt documentation**: File-based prompts with clear template variable usage

### Communication & Training
- [x] **Development team onboarding**: Core concepts and architecture communicated through documentation
- [x] **Testing approach documentation**: Two-phase validation methodology documented
- [ ] **User guide creation**: Comprehensive user documentation for both interfaces
- [ ] **Best practices guide**: Documentation testing methodology and recommendations

## Work Log

### 2025-07-19: Enhanced Validation System Implementation
**Duration**: 8 hours
**Commits**: 15 commits
**Primary Focus**: Two-phase validation and automatic workflow progression

**Completed PRD Items**:
- [x] **Structured JSON result format** - Implemented SectionTestResult interface with whatWasDone, issues, recommendations fields
- [x] **Automatic workflow progression** - Added logic to return next section prompts automatically after result submission
- [x] **Two-phase validation approach** - Complete restructure of section testing prompts with functional + semantic validation
- [x] **Enhanced error handling** - Robust JSON parsing, validation, and error recovery throughout workflow

**Additional Work Done**:
- **Comprehensive prompt engineering** - Complete restructure of `doc-testing-test-section.md` with mandatory semantic analysis checklists
- **Data structure cleanup** - Removed unused fields from interfaces (lineRange, purpose, sectionDependencies)
- **Bug fixes** - CLI parameter handling when sessionId provided without filePath, phase override logic corrections
- **Agent instruction updates** - Enhanced workflow guidance reflecting new JSON format and automatic progression

**Technical Decisions Made**:
- **Decision**: Use structured JSON results instead of free-form text
- **Rationale**: Enables programmatic analysis in later phases and provides consistent data structure
- **Impact**: Simplifies analysis phase implementation and improves result processing

**Challenges Encountered**:
- **CLI workflow bugs** - Parameter handling edge cases required careful debugging and testing
- **Prompt effectiveness** - Initial prompts focused too heavily on functional testing, missing semantic validation

**Quality Metrics**:
- **Tests Added**: All existing tests updated for new interfaces, comprehensive test coverage maintained
- **Code Coverage**: 558 tests passing across 25 suites
- **Manual Testing**: Complete 7-section workflow tested successfully

**Lessons Learned**:
- **Two-phase validation critical** - Functional testing alone misses significant documentation accuracy issues
- **Automatic progression essential** - Manual CLI calls between sections create unnecessary friction
- **Prompt quality has massive impact** - Well-structured prompts with explicit checklists dramatically improve validation effectiveness

**Next Session Priorities**:
- **Analysis phase implementation** - Develop cross-section analysis prompts and workflow
- **Fix generation design** - Define approach for narrative-preserving documentation improvements
- **Performance optimization** - Address any bottlenecks identified during analysis phase development

**Files Modified**:
`src/core/doc-testing-types.ts, src/core/doc-testing-session.ts, src/tools/test-docs.ts, prompts/doc-testing-test-section.md, tests/ (multiple test files)`

---

### 2025-07-18: Foundation and Prompt Development  
**Duration**: 6 hours
**Completed PRD Items**:
- [x] **Session-based architecture** - Complete implementation with persistence and state management
- [x] **CLI and MCP interfaces** - Feature parity achieved with shared core engine
- [x] **File-based prompt system** - Template-driven prompts with variable substitution
- [x] **Section-based organization** - Document structure discovery and section management

**Next Session Focus**: Analysis phase prompt development and cross-section synthesis capabilities

## Current Status Summary
- **Overall Completion**: ~75%
- **Core Features**: 100% implemented and tested
- **Remaining Work**: Analysis and fix generation phases (~25% of total effort)
- **Test Coverage**: 558 tests passing across 25 suites
- **Next Milestone**: Cross-section analysis implementation

## Priority: High
This system significantly enhances documentation quality assurance by ensuring all examples work correctly and descriptions accurately reflect reality, directly impacting user experience and product adoption.