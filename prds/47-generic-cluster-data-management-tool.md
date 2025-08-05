# PRD-47: Generic Cluster Data Management Tool

**Status**: Draft  
**Created**: 2025-08-05  
**GitHub Issue**: [#47](https://github.com/vfarcic/dot-ai/issues/47)  
**Dependencies**: None  
**Related PRDs**: Foundational for PRDs #48 (Resource Capabilities) and #49 (Resource Dependencies)

## Executive Summary

Current MCP tool `mcp__dot-ai__manageOrgData` only handles organizational patterns, but our architecture requires unified management of three data types: organizational patterns, resource capabilities, and resource dependencies. This PRD extends the existing tool to provide a generic interface for managing all cluster data types through Vector DB storage, setting the foundation for enhanced resource discovery.

## Problem Statement

### Current Limitations
1. **Single Data Type**: Only manages organizational patterns
2. **Tool Proliferation Risk**: Without generalization, we'd need separate tools for capabilities and dependencies
3. **User Confusion**: Multiple similar tools create cognitive overhead
4. **Code Duplication**: Separate tools would duplicate Vector DB operations

### User Experience Issues
- Users need to learn multiple tools for related data management tasks
- No unified approach to cluster data management
- Inconsistent interfaces for similar operations

## Success Criteria

### Primary Goals
- **Unified Interface**: Single tool manages all cluster data types
- **Backward Compatibility**: Existing pattern functionality preserved
- **Extensible Architecture**: Easy to add new data types
- **Consistent UX**: Same interaction patterns across all data types

### Success Metrics
- All existing pattern management functionality works unchanged
- New generic interface successfully handles patterns
- Foundation ready for capabilities and dependencies data types
- Users can discover and use all data management features through single tool

## Solution Architecture

### Current Architecture
```
mcp__dot-ai__manageOrgData
├── Patterns only
└── Vector DB storage
```

### Target Architecture  
```
mcp__dot-ai__manageClusterData
├── Organizational Patterns (existing)
├── Resource Capabilities (foundation)
├── Resource Dependencies (foundation)
└── Vector DB (shared)
```

### Tool Interface Design

#### Interactive Data Type Selection
```typescript
// User calls: mcp__dot-ai__manageClusterData
// System presents menu:
"What would you like to manage?
 1. 📋 Organizational Patterns (existing functionality)
 2. 🔍 Resource Capabilities (coming soon)  
 3. 🔗 Resource Dependencies (coming soon)
 4. 📊 View cluster data status"
```

#### Direct Parameter Access
```typescript
// Advanced users can specify directly:
manageClusterData({
  dataType: 'patterns',
  operation: 'create',
  // ... existing pattern parameters
})
```

## Technical Implementation

### Data Type Abstraction
```typescript
interface ClusterDataManager {
  dataType: 'patterns' | 'capabilities' | 'dependencies';
  operations: {
    create: (data: DataTypeSpecific) => Promise<void>;
    list: (filters?: FilterOptions) => Promise<DataTypeSpecific[]>;
    get: (id: string) => Promise<DataTypeSpecific>;
    delete: (id: string) => Promise<void>;
  };
}
```

### Migration Strategy
1. **Preserve Existing API**: All current `manageOrgData` functionality works unchanged
2. **Add Generic Layer**: New `manageClusterData` tool with data type selection
3. **Shared Infrastructure**: Reuse existing Vector DB and workflow patterns
4. **Gradual Enhancement**: Add capabilities/dependencies in future PRDs

## Implementation Milestones

### Milestone 1: Generic Tool Framework
- [ ] Create `mcp__dot-ai__manageClusterData` tool with data type selection
- [ ] Implement interactive menu for data type selection
- [ ] Add direct parameter access for advanced users
- **Success Criteria**: Users can access tool and see all data type options

### Milestone 2: Pattern Integration  
- [ ] Integrate existing pattern management functionality
- [ ] Ensure all existing pattern operations work through new interface
- [ ] Maintain backward compatibility with existing pattern workflows
- **Success Criteria**: All existing pattern management features work unchanged

### Milestone 3: Capabilities Foundation
- [ ] Add capabilities data type structure (no implementation yet)
- [ ] Design capabilities management interface
- [ ] Create placeholder capabilities operations
- **Success Criteria**: Framework ready for capabilities implementation in PRD #48

### Milestone 4: Dependencies Foundation
- [ ] Add dependencies data type structure (no implementation yet)
- [ ] Design dependencies management interface  
- [ ] Create placeholder dependencies operations
- **Success Criteria**: Framework ready for dependencies implementation in PRD #49

### Milestone 5: Documentation and Testing
- [ ] Update MCP documentation with new tool interface
- [ ] Create comprehensive test suite for generic framework
- [ ] Validate all existing pattern functionality still works
- **Success Criteria**: Feature fully documented and tested, ready for extension

## Risk Assessment

### Technical Risks
- **Breaking Changes**: Risk of breaking existing pattern functionality during refactoring
- **Interface Complexity**: Generic interface might be more complex than specific tools
- **Performance Impact**: Additional abstraction layer could affect performance

### Mitigation Strategies  
- **Thorough Testing**: Comprehensive test suite ensuring backward compatibility
- **Incremental Migration**: Preserve existing tool while building new interface
- **Performance Monitoring**: Benchmark operations to ensure no regression

## Dependencies and Assumptions

### Technical Dependencies
- Existing `mcp__dot-ai__manageOrgData` functionality and Vector DB infrastructure
- MCP server framework for tool registration and parameter handling
- Current organizational pattern data structure and operations

### Assumptions
- Vector DB approach will scale to handle all three data types efficiently
- Users prefer unified interface over multiple specialized tools
- Generic abstraction won't significantly impact performance or usability

## Related Work

### Enables Future Work
- **PRD #48**: Resource Capabilities Discovery (depends on this foundation)
- **PRD #49**: Resource Dependencies Discovery (depends on this foundation)  
- Enhanced recommendation system with unified data access

### Integration Points
- Current MCP server architecture and tool registration
- Existing Vector DB service and pattern storage
- Future recommendation system enhancements

## Appendix

### Example User Workflows

#### Current Pattern Management (Preserved)
```bash
# This continues to work exactly as before
mcp-tool manageOrgData --operation create --description "PostgreSQL HA pattern"
```

#### New Generic Interface
```bash
# Interactive mode
mcp-tool manageClusterData
> "What would you like to manage?"
> "1. Organizational Patterns"
> [User selects 1, gets existing pattern interface]

# Direct mode  
mcp-tool manageClusterData --dataType patterns --operation create
> [Same as existing pattern creation]
```

#### Future Extensibility (PRDs #48-49)
```bash
# Will be possible after future PRDs
mcp-tool manageClusterData --dataType capabilities --operation scan
mcp-tool manageClusterData --dataType dependencies --operation analyze
```

### Technical Architecture Details

#### Data Type Registry
```typescript
const dataTypeHandlers = {
  patterns: new PatternDataManager(),      // Existing
  capabilities: new CapabilitiesManager(), // PRD #48
  dependencies: new DependenciesManager()  // PRD #49
};
```

#### Unified Operations Interface
```typescript
interface DataTypeManager {
  list(): Promise<DataItem[]>;
  get(id: string): Promise<DataItem>;  
  create(data: CreateRequest): Promise<DataItem>;
  delete(id: string): Promise<void>;
  // Data-type specific operations via extensions
}
```

This foundation ensures clean separation of concerns while providing unified user experience across all cluster data management operations.