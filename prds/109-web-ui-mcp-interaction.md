# PRD: Web UI for MCP Server Interaction

**Issue**: [#109](https://github.com/vfarcic/dot-ai/issues/109)  
**Created**: 2025-09-17  
**Status**: Draft  
**Priority**: Medium  

---

## Executive Summary

Create a web-based user interface (separate repository: `dot-ai-web-ui`) that communicates with the DevOps AI Toolkit MCP server via its REST API. The Web UI provides visual, interactive interfaces for deploying applications, managing organizational patterns, and troubleshooting Kubernetes issues—offering an accessible alternative to CLI-based MCP clients like Claude Code.

**Key Technical Approach:**
- Separate repository from `dot-ai` MCP server
- Uses existing REST API gateway (no MCP protocol in Web UI)
- TypeScript types auto-generated from OpenAPI schema
- Direct React component rendering from semantic JSON responses

## Problem Statement

### Current State
- MCP server provides powerful Kubernetes AI capabilities through CLI clients (Claude Code, Cursor)
- Users must use MCP-compatible editors or command-line tools to interact with the system
- No web-based interface exists for users who prefer browser-based interactions
- Visual data representation is limited in text-based CLI environments

### Pain Points
- **Accessibility Barrier**: Users unfamiliar with CLI tools or MCP clients can't easily access the system
- **Limited Visualization**: Complex Kubernetes data and AI recommendations are hard to visualize in text-only interfaces  
- **User Experience Gap**: No graphical interface for exploring cluster capabilities, solutions, and deployments
- **Sharing & Collaboration**: Difficult to share visual insights or collaborate on deployment decisions

## Success Criteria

### User Experience Success
- [ ] Users can interact with all MCP functionality through a web browser
- [ ] Chat interface provides intuitive conversation flow similar to Claude Code
- [ ] Complex data (cluster capabilities, recommendations, manifests) displays with visual representations
- [ ] Response time for MCP tool calls under 3 seconds for standard operations

### Technical Success  
- [ ] Web UI successfully connects to and communicates with existing MCP server
- [ ] All current MCP tools accessible through the web interface
- [ ] Visual components render Kubernetes resources, deployment statuses, and AI recommendations
- [ ] System handles concurrent users without performance degradation

### Business Success
- [ ] Increased MCP adoption due to improved accessibility
- [ ] Positive user feedback on visual data representation
- [ ] Documentation demonstrates clear setup and usage workflows

## Target Users

### Primary Users
- **DevOps Engineers**: Need visual overview of cluster capabilities and deployment status
- **Platform Engineers**: Want graphical interface for managing AI recommendations and solutions  
- **Developers**: Prefer browser-based tools over CLI for exploring Kubernetes deployment options

### Secondary Users
- **Engineering Managers**: Need visual dashboards for understanding deployment patterns and cluster usage
- **Site Reliability Engineers**: Want graphical monitoring of AI-assisted deployment outcomes

## User Stories & Workflows

### Core User Journey
```
User opens Web UI → Authenticated session → Chat interface loads → 
User types intent ("deploy web app") → MCP processes request → 
Visual solution cards displayed → User configures through forms → 
Deployment manifests shown with syntax highlighting → 
Deploy button triggers MCP deployment → Status updates shown graphically
```

### Detailed User Stories

**As a DevOps Engineer**, I want to:
- See cluster capabilities as interactive cards/charts rather than text lists
- Configure deployment solutions through visual forms instead of typing answers
- View generated Kubernetes manifests with syntax highlighting and collapsible sections
- Monitor deployment progress through visual status indicators

**As a Platform Engineer**, I want to:
- Browse solution patterns through a visual catalog interface
- Create and manage organizational patterns using drag-and-drop or form interfaces  
- Visualize resource dependencies as interactive graphs
- Share deployment configurations via shareable URLs

**As a Developer**, I want to:
- Chat with the AI in a familiar interface similar to ChatGPT/Claude
- See deployment recommendations as comparison tables or decision trees
- Preview how my application will look in the cluster before deploying
- Get visual feedback on deployment success/failure with actionable next steps

## Technical Architecture

### High-Level Architecture
```
[Web Browser] ↔ [Frontend (React)] ↔ [REST API] ↔ [Existing MCP Server] ↔ [Kubernetes API]
                      ↓
                Parse semantic JSON
                      ↓
                Render React components
```

**Repository**: Separate repository `dot-ai-web-ui` (distinct from `dot-ai` MCP server)

### Technical Design Decisions

**Data Flow:**
```
MCP Server REST API → Semantic JSON → Web UI → Parse JSON → Render React Components
```

The MCP server's existing REST API gateway returns structured, semantic JSON. The Web UI:
1. Fetches OpenAPI 3.0 schema from `GET /api/v1/openapi`
2. Generates TypeScript types from OpenAPI schema
3. Makes REST API calls to `POST /api/v1/tools/{toolName}`
4. Parses semantic JSON from responses
5. Renders directly using React components

**Key Architectural Principles:**
- **Server stays UI-agnostic**: MCP server returns semantic JSON, no UI-specific formatting
- **Web UI controls presentation**: Full control over styling, layout, and interactions
- **OpenAPI provides contract**: Types generated automatically, no shared code needed
- **No transformation layer**: Direct rendering from semantic JSON to React components
- **Standard HTTP**: Simple REST API calls, no MCP protocol complexity in Web UI

**What We're NOT Doing:**
- ❌ Microsoft Adaptive Cards (unnecessary transformation layer for single-platform web app)
- ❌ MCP-UI or Remote DOM (adds complexity without benefit)
- ❌ Server-driven UI (couples server to presentation logic, breaks other clients)
- ❌ MCP protocol in Web UI (REST API is simpler and sufficient)
- ❌ Custom UI protocol (semantic JSON from server is already structured)

**Format Standardization:**
During Web UI development, if multiple tools return semantically identical data in different formats (e.g., questions, solutions, status), we will standardize these in the MCP server to:
- Simplify Web UI component architecture
- Provide cleaner OpenAPI schema
- Benefit all future clients

### Component Breakdown

**Frontend Application (New Repository: `dot-ai-web-ui`)**
- **API Client**: TypeScript types auto-generated from OpenAPI schema
- **REST Communication**: Standard HTTP fetch/axios calls to MCP server
- **React Components**: Direct rendering (SolutionPicker, ManifestViewer, QuestionForm, etc.)
- **UI Library**: Material-UI (MUI) or shadcn/ui for base components
- **State Management**: User sessions, conversation history, deployment tracking

**Backend Integration (No Changes Required)**
- **MCP Server**: Existing REST API gateway at `/api/v1/*`
- **OpenAPI Endpoint**: Schema available at `GET /api/v1/openapi`
- **Tool Endpoints**: All tools at `POST /api/v1/tools/{toolName}`
- **CORS**: Already configured for cross-origin requests

### Technology Stack

**Frontend (Separate Repository)**
- **Framework**: React with Next.js or Vite
- **Language**: TypeScript
- **API Client**: Auto-generated from OpenAPI schema using `@openapitools/openapi-generator-cli`
- **UI Components**: Material-UI (MUI) or shadcn/ui
- **Styling**: Tailwind CSS
- **State Management**: React Context + hooks (or Zustand if needed)
- **Syntax Highlighting**: Prism.js or react-syntax-highlighter
- **HTTP Client**: Fetch API or Axios

**Backend (Existing - No Changes)**
- **REST API Gateway**: Already implemented in dot-ai
- **OpenAPI 3.0**: Auto-generated specification
- **Response Format**: Semantic JSON (tool results unwrapped from MCP format)

## Feature Requirements

### Must-Have Features (MVP)

#### Intent Input Interface
- [ ] Text input for entering deployment intents and queries
- [ ] History of previous intents and results
- [ ] Loading states during REST API calls
- [ ] Quick action buttons for common operations

**Note**: Primary UX is visual (cards, forms, manifests), not chat-based. Intent input is for entering deployment intents, but responses render as rich visual components.

#### REST API Tool Integration
- [ ] All existing MCP tools accessible via REST API
- [ ] Support for `recommend`, `chooseSolution`, `answerQuestion`, `generateManifests`, `deployManifests`
- [ ] Support for `manageOrgData`, `remediate`, `projectSetup` workflows
- [ ] Proper error handling for REST API failures

#### Visual Data Representation
- [ ] Cluster capabilities displayed as interactive cards/tables
- [ ] Solution configurations shown as forms instead of Q&A
- [ ] Kubernetes manifests with syntax highlighting and collapsible sections
- [ ] Deployment status with progress indicators and success/error states

#### Core Workflows
- [ ] Solution recommendation → configuration → deployment flow
- [ ] Organizational pattern management with visual editors
- [ ] Remediation workflows with issue visualization and step-by-step guidance
- [ ] Documentation testing with results presentation

### Should-Have Features (Phase 2)

#### Enhanced Visualization
- [ ] Resource dependency graphs using network diagrams
- [ ] Cluster topology visualization showing nodes, pods, services
- [ ] Deployment timeline with historical data
- [ ] Comparison tables for solution alternatives

#### Collaboration Features  
- [ ] Shareable conversation URLs
- [ ] Export conversation/deployment configs
- [ ] Team workspaces for shared patterns and solutions

#### Advanced UX
- [ ] Drag-and-drop solution configuration
- [ ] Auto-complete for Kubernetes resources and common patterns
- [ ] Saved conversation templates and quick actions
- [ ] Dark/light mode theming

### Could-Have Features (Future)
- [ ] Mobile-responsive design for tablet access
- [ ] Integration with Git repositories for manifest storage
- [ ] Webhook notifications for deployment events
- [ ] Multi-cluster support with cluster switching

## Implementation Milestones

### Milestone 0: Repository Setup and PRD Migration (1 day)
- [ ] Create new GitHub repository: `dot-ai-web-ui`
- [ ] Initialize with README, LICENSE, and basic structure
- [ ] Move this PRD to new repository
- [ ] Update PRD with repository links and setup instructions
- [ ] Configure repository settings (branch protection, CI/CD placeholder)

**Success Criteria**: Repository exists with PRD and basic setup

### Milestone 1: API Client & Basic Framework (1-2 weeks)
- [ ] Set up React + TypeScript project (Next.js or Vite)
- [ ] Configure OpenAPI code generation from `dot-ai` REST API
- [ ] Generate TypeScript types and API client from OpenAPI schema
- [ ] Create basic routing structure
- [ ] Implement API client wrapper with error handling
- [ ] Test connection to MCP server REST API (`/api/v1/tools/version`)

**Success Criteria**: TypeScript types generated from OpenAPI, successful REST API calls

### Milestone 2: Core Visual Components (2-3 weeks)
- [ ] Implement SolutionPicker component (displays recommendation results)
- [ ] Implement QuestionForm component (handles answerQuestion workflow)
- [ ] Implement ManifestViewer component with syntax highlighting
- [ ] Implement StatusDisplay component (deployment status, errors)
- [ ] Create base layout with navigation and header
- [ ] Add UI component library (MUI or shadcn/ui)

**Success Criteria**: Core components render semantic JSON from REST API responses

### Milestone 3: Complete Tool Workflows (2-3 weeks)
- [ ] Implement full `recommend` workflow (intent → solutions → questions → manifests → deploy)
- [ ] Implement `remediate` workflow (issue analysis → remediation steps)
- [ ] Implement `manageOrgData` workflows (patterns, policies, capabilities)
- [ ] Implement `projectSetup` workflow
- [ ] Add workflow state management
- [ ] Error handling and user feedback systems

**Success Criteria**: All major MCP tools accessible with complete multi-step workflows

### Milestone 4: Enhanced User Experience (2-3 weeks)
- [ ] Responsive design for different screen sizes
- [ ] Message history persistence and session management
- [ ] Copy/export functionality for manifests and configurations
- [ ] Performance optimization for large data sets

**Success Criteria**: Professional-grade user experience comparable to modern web applications

### Milestone 5: Testing & Documentation (2-3 weeks)
- [ ] Comprehensive test suite for frontend components
- [ ] Integration tests with MCP server
- [ ] Complete user documentation and setup guides  
- [ ] Deployment documentation for production environments

**Success Criteria**: System ready for production use with complete documentation

### Milestone 6: Production Deployment (1-2 weeks)
- [ ] Production deployment pipeline setup
- [ ] Security review and hardening
- [ ] Performance monitoring and analytics
- [ ] User feedback collection mechanisms

**Success Criteria**: Web UI publicly available and monitored in production

## Technical Considerations

### Security
- **Authentication**: Determine if web interface needs user authentication (MVP may skip for internal use)
- **Authorization**: Kubernetes RBAC enforced by MCP server, not Web UI
- **Network Security**:
  - HTTPS for production Web UI deployment
  - CORS properly configured for allowed origins
  - API rate limiting if Web UI is public-facing
- **Input Validation**:
  - Client-side validation for UX
  - Server-side validation already in place (MCP server validates all inputs)
- **Secrets Management**: Web UI should never expose Kubernetes credentials or API keys

### Performance
- **REST API Calls**: Standard HTTP requests with proper loading states and feedback
- **Large Data Handling**: Pagination or virtualization for large cluster capability lists
- **Caching**: Client-side caching of cluster data, solution templates, and OpenAPI schema
- **Bundle Size**: Code splitting, lazy loading, tree shaking for fast initial loads
- **TypeScript Compilation**: Generated API types increase build time but provide type safety

### Scalability
- **Concurrent Users**: Multiple simultaneous web sessions connecting to single MCP server
- **Session Management**: Persistent conversations across browser refreshes
- **Resource Usage**: Frontend memory usage with large conversation histories

### Integration Challenges
- **OpenAPI Schema Drift**: Web UI TypeScript types must stay synchronized with REST API changes
  - Mitigation: CI/CD regenerates types from OpenAPI schema on every build
  - TypeScript compilation will fail if incompatible changes detected
- **REST API Versioning**: Managing breaking changes in REST API responses
  - Mitigation: OpenAPI schema versioning, semantic versioning for both repositories
- **State Synchronization**: Keeping web UI state consistent with MCP server state during multi-step workflows
  - Mitigation: Session management via sessionId in tool responses
- **Error Handling**: Graceful handling of REST API errors, timeouts, and network issues
  - Mitigation: Proper error boundaries, retry logic, user-friendly error messages
- **CORS Configuration**: Ensuring CORS settings allow Web UI to call REST API
  - Note: Already configured in dot-ai REST API gateway

## Dependencies & Risks

### Technical Dependencies
- **MCP Server REST API**: Web UI depends on existing REST API gateway in dot-ai
- **OpenAPI Schema Availability**: Requires `GET /api/v1/openapi` endpoint for type generation
- **CORS Configuration**: MCP server must allow cross-origin requests from Web UI domain
- **Kubernetes Access**: MCP server must have cluster access (Web UI is presentation layer only)
- **Browser Support**: Modern browsers with ES6+, fetch API, and modern JavaScript features

### Project Risks
- **Complexity Risk**: Web UI development may be more complex than anticipated
- **Maintenance Risk**: Additional codebase to maintain alongside MCP server
- **User Adoption Risk**: Users may prefer existing CLI tools over web interface
- **Performance Risk**: Web interface may be slower than direct CLI interaction

### Mitigation Strategies
- **Start Simple**: Begin with basic chat interface, add visual components incrementally
- **Reuse Patterns**: Leverage existing web UI component libraries and patterns
- **Early Feedback**: Get user feedback after each milestone to guide development
- **Performance Testing**: Regular performance testing with realistic data loads

## Success Metrics

### Adoption Metrics
- Number of unique users per month
- Session duration and frequency of use
- Conversion from CLI to Web UI users

### Usage Metrics  
- Most frequently used MCP tools through web interface
- Average time to complete deployment workflows
- User completion rates for multi-step processes

### Quality Metrics
- User satisfaction surveys and feedback
- Bug reports and resolution time
- Performance metrics (load time, responsiveness)

## Future Considerations

### Potential Expansions
- **Mobile App**: Native mobile applications for iOS/Android
- **Desktop App**: Electron-based desktop application
- **Enterprise Features**: SSO integration, audit logging, role-based permissions
- **AI Enhancements**: Visual AI recommendations, drag-and-drop deployment building

### Integration Opportunities
- **IDE Plugins**: Browser-based IDE integration
- **CI/CD Integration**: Trigger deployments from CI/CD pipelines through web interface
- **Monitoring Integration**: Connect to monitoring systems for deployment health visualization

---

## Change Log

- **2025-09-17**: Initial PRD creation
- **2025-01-15**: Major architectural revision
  - Changed from MCP protocol to REST API communication
  - Specified separate repository (`dot-ai-web-ui`)
  - Added OpenAPI schema-driven TypeScript type generation
  - Removed Adaptive Cards, MCP-UI, and transformation layer approaches
  - Added Technical Design Decisions section
  - Added Milestone 0 for repository setup
  - Updated all milestones to reflect REST API approach
  - Added format standardization strategy
  - Clarified that MCP server requires minimal/no changes
- **Status**: Ready for implementation

## Stakeholders

- **Product Owner**: [To be assigned]
- **Tech Lead**: [To be assigned] 
- **Designer**: [To be assigned]
- **QA Lead**: [To be assigned]