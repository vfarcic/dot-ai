# PRD #58: Resource Schema Question Generation Fix and System Analysis

**GitHub Issue**: [#58](https://github.com/vfarcic/dot-ai/issues/58)  
**Status**: Draft  
**Priority**: High  
**Owner**: TBD  

## Problem Statement

The AI recommendation system generates incomplete configuration questions for Kubernetes resources, leading to broken deployments and poor user experience. Users receive inadequate configuration prompts that miss critical required fields and important options.

**Current Broken Behavior**:
- **Example**: `sqls.devopstoolkit.live` resource
  - **Asked**: Basic metadata (`name`, `namespace`)
  - **Missing**: Required field `spec.size` (enum: small/medium/large)
  - **Missing**: Important fields `spec.databases`, `spec.region`, `spec.version`
  - **Result**: Deployment fails due to missing required configuration

**System-Wide Impact**:
- **Any assembled solution** may have incomplete question generation
- **All resource types** potentially affected (CRDs, standard Kubernetes resources)
- **User trust** damaged by broken deployment workflows

## Root Cause Analysis

**Primary Issue**: Schema resolution pipeline fails to properly parse and include detailed `kubectl explain` output in AI prompts.

**Technical Breakdown**:
1. **Schema Fetch**: `kubectl explain` output not properly captured
2. **Schema Parsing**: Resource properties and constraints not extracted  
3. **AI Context**: Schema information missing from question generation prompts
4. **Question Logic**: AI falls back to generic metadata questions

**Evidence**:
- AI debug shows empty Properties section for `sqls.devopstoolkit.live`
- Question generation only asks for `name` and `namespace`
- No awareness of required `spec.size` field or other spec configuration

## Success Criteria

### Primary Objectives
1. **Required fields coverage** - All required resource fields generate configuration questions
2. **Important fields coverage** - Relevant optional fields included based on user intent  
3. **Proper field grouping** - Questions grouped by complexity (required → basic → advanced)
4. **Smart defaults** - Appropriate defaults for non-critical fields only
5. **Universal application** - Fix applies to all assembled solutions, any resource type

### Validation Test Cases
- **`sqls.devopstoolkit.live`** → Must ask for `spec.size` (required), `spec.databases`, `spec.region`
- **Azure FlexibleServer** → Must ask for required fields, important optional configuration
- **Standard Kubernetes resources** → Proper question generation for Deployments, Services, etc.
- **Complex CRDs** → Comprehensive question coverage for operator-managed resources

### Quality Metrics
1. **Zero deployment failures** due to missing required configuration
2. **Complete coverage** of resource-critical fields in questions
3. **Appropriate defaults** that don't require user input for non-essential fields
4. **Consistent behavior** across all resource types and providers

## Solution Approach

### Phase 1: System Exploration and Discovery 🔍
**Objective**: Comprehensive analysis of the question generation system to identify all issues and inconsistencies

**Exploration Areas**:
- **Schema Resolution Pipeline**: How `kubectl explain` data flows through the system
- **Question Generation Logic**: AI prompt construction and template processing
- **Resource Coverage Analysis**: Test question generation across diverse resource types
- **Field Classification**: Understand how required vs optional vs advanced fields should be handled
- **Default Value Strategy**: Identify which fields should have smart defaults vs user input

**Discovery Tasks**:
- [ ] **Map complete question generation workflow** - From resource selection to user prompts
- [ ] **Audit schema resolution pipeline** - Trace `kubectl explain` data processing
- [ ] **Test diverse resource types** - CRDs, standard resources, complex operators
- [ ] **Identify all failure patterns** - Not just `sqls.devopstoolkit.live` but system-wide issues
- [ ] **Analyze AI prompt context** - What schema information reaches question generation prompts
- [ ] **Document current vs expected behavior** - Clear gap analysis for each resource type

**Deliverables**: Complete understanding of system behavior, comprehensive issue catalog

### Phase 2: Schema Resolution Fix 🔧
**Objective**: Fix the technical pipeline that provides schema information to AI

**Implementation Areas**:
- **Enhanced schema fetching** - Ensure `kubectl explain` output properly captured
- **Schema parsing improvements** - Extract required fields, types, constraints, descriptions
- **AI context enhancement** - Provide complete schema information in question generation prompts
- **Field classification logic** - Properly categorize required vs important vs advanced fields

**Tasks**:
- [ ] **Fix schema fetching pipeline** - Ensure complete `kubectl explain` output captured
- [ ] **Implement schema parsing** - Extract required fields, types, enums, descriptions
- [ ] **Enhance AI prompts** - Include complete schema context for question generation
- [ ] **Add field classification** - Logic to identify required vs important vs nice-to-have fields
- [ ] **Implement smart defaults** - Appropriate defaults for non-critical configuration

**Deliverables**: Robust schema resolution system providing complete resource information

### Phase 3: Question Generation Enhancement ✨
**Objective**: Improve AI question generation logic and user experience

**Enhancement Areas**:
- **Question completeness** - Cover all required and important fields
- **Question grouping** - Proper complexity-based organization  
- **Question quality** - Clear descriptions, examples, validation hints
- **Default value strategy** - Smart defaults that don't burden users

**Tasks**:
- [ ] **Enhance question generation prompts** - Instructions for comprehensive field coverage
- [ ] **Implement question grouping** - Required → Basic → Advanced organization
- [ ] **Add field descriptions** - Include helpful context from schema descriptions
- [ ] **Implement validation hints** - Format requirements, enum options, examples
- [ ] **Smart default strategy** - Defaults for fields that don't impact functionality or intent

**Deliverables**: High-quality question generation that covers all necessary configuration

### Phase 4: Comprehensive Validation 🧪
**Objective**: Ensure fix works across all resource types without regressions

**Validation Areas**:
- **Resource type coverage** - CRDs, standard resources, complex operators
- **Question completeness** - All critical fields covered appropriately  
- **Deployment success** - Generated configurations result in successful deployments
- **User experience** - Questions are clear, well-organized, not overwhelming

**Tasks**:
- [ ] **Test diverse resource types** - Comprehensive coverage validation
- [ ] **Validate question completeness** - No missing critical fields
- [ ] **End-to-end deployment testing** - Generated configs deploy successfully
- [ ] **User experience validation** - Questions are clear and appropriately grouped
- [ ] **Regression testing** - Existing functionality unaffected

**Deliverables**: Production-ready question generation system with verified quality

## Technical Scope

### Investigation Points
- **Schema Resolution Pipeline**: `src/core/schema.ts` - How resource schemas are fetched and processed
- **Question Generation**: AI prompt templates and logic for creating configuration questions  
- **Resource Schema Objects**: Data structures that hold schema information for AI consumption
- **kubectl Integration**: How `kubectl explain` output is captured and parsed

### Potential Changes
- **Schema fetching improvements** - Better `kubectl explain` integration and parsing
- **AI prompt enhancements** - More detailed schema context for question generation
- **Question logic updates** - Field classification and grouping improvements  
- **Default value system** - Smart defaults for appropriate fields

### Testing Strategy
- **Schema resolution tests** - Verify complete schema information captured
- **Question generation tests** - Validate question completeness across resource types
- **Integration tests** - End-to-end validation of question → configuration → deployment
- **Regression tests** - Ensure existing functionality preserved

## Dependencies & Constraints

### Dependencies
- ✅ **kubectl access** - System can run kubectl explain commands
- ✅ **AI integration** - Question generation via AI prompts working
- ✅ **Resource discovery** - System can identify available resource types

### Constraints
- **Maintain existing UX** - Don't break current question grouping (required → basic → advanced)
- **Performance considerations** - Schema fetching shouldn't significantly slow recommendations
- **AI token limits** - Schema information must fit within prompt context limits
- **Backward compatibility** - Existing solution configurations should continue working

## Risks & Mitigations

### Risk: Schema Complexity Overload
- **Impact**: Too many questions overwhelm users with complex resources
- **Mitigation**: Intelligent field classification, appropriate defaults, clear grouping

### Risk: Performance Impact
- **Impact**: Additional schema fetching slows down recommendations
- **Mitigation**: Schema caching, parallel processing, optimize kubectl interactions

### Risk: AI Context Limits
- **Impact**: Large schemas exceed AI prompt token limits
- **Mitigation**: Schema summarization, focus on most important fields, chunking strategies

### Risk: Resource Type Diversity
- **Impact**: Fix works for some resources but not others
- **Mitigation**: Comprehensive testing across resource types, generic solution design

## Success Metrics

### Quantitative Metrics
- **Zero deployment failures** due to missing required configuration
- **100% required field coverage** in generated questions
- **Consistent question generation** across all resource types
- **No performance regression** in recommendation speed

### Qualitative Metrics  
- **Improved user confidence** in deployment success
- **Better resource utilization** through proper configuration
- **Reduced support burden** from deployment failures
- **Enhanced platform adoption** through reliable workflows

## Out of Scope

### Not Included in This PRD
- **Resource validation** - Validating field values beyond basic format checking
- **Advanced schema features** - Complex validation rules, conditional fields, custom validators
- **UI/UX redesign** - Major changes to question presentation or user interaction flow
- **Resource creation optimization** - Performance improvements unrelated to question generation

### Future Considerations
- **Dynamic schema updates** - Handling schema changes in live clusters
- **Custom validation rules** - Organization-specific field validation and constraints
- **Advanced defaults** - AI-powered smart defaults based on organizational patterns
- **Question personalization** - User-specific question preferences and shortcuts

## Work Log

### [Date to be filled during implementation]
*Work progress and discoveries will be logged here as implementation proceeds*