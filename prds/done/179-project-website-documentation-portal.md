# PRD: Project Website with Documentation Portal

**GitHub Issue**: [#179](https://github.com/vfarcic/dot-ai/issues/179)

## Overview

### Problem Statement
The DevOps AI Toolkit currently lacks a dedicated website to showcase the tool and provide accessible documentation for end users. Documentation is scattered in the repository without a user-friendly interface, making it difficult for potential users to discover features, understand capabilities, and get started with the tool. This creates barriers to adoption and limits the project's reach.

### Solution Summary
Create a single-page website with an integrated documentation portal that:
- Showcases the project with a compelling landing page
- Provides user-friendly access to all existing documentation
- Leverages existing docs in the repository with minimal changes
- Keeps documentation source files in this repo alongside the website code
- Follows CNCF project standards and best practices
- Is easy to maintain and update as the project evolves

### Target Users
- **Primary**: End users evaluating or adopting the DevOps AI Toolkit
- **Secondary**: Contributors looking to understand the project
- **Tertiary**: CNCF reviewers and open source community members

### Success Criteria
- [ ] Professional, single-page website live and publicly accessible
- [ ] All existing documentation integrated and easily navigable
- [ ] Documentation remains in repository (not external platform)
- [ ] Website follows CNCF project standards
- [ ] Clear getting started path for new users
- [ ] Fast load times and good SEO
- [ ] Easy for maintainers to update content
- [ ] Mobile-responsive design

## User Experience

### User Journey
1. **Discovery**: User finds project via search, GitHub, or referral
2. **Landing**: Arrives at website homepage with clear project description
3. **Exploration**: Browses features, benefits, and use cases
4. **Learning**: Accesses documentation to understand capabilities
5. **Getting Started**: Follows installation and setup guides
6. **Deep Dive**: Explores API reference, examples, and advanced topics
7. **Contribution**: Finds contributor guidelines and community resources

### Key User Flows

#### New User Flow
```
Homepage → What is DevOps AI Toolkit? → Quick Start → First Deployment
```

#### Existing User Flow
```
Documentation Search → Specific Guide → API Reference → Examples
```

#### Contributor Flow
```
Homepage → Documentation → Contributing Guide → Development Setup
```

### Information Architecture (Initial)
```
Homepage (Single Page)
├── Hero Section
│   ├── Project tagline
│   ├── Key value proposition
│   └── Primary CTA (Get Started)
├── Features Overview
│   ├── Cluster Discovery
│   ├── AI Recommendations
│   ├── Operator Integration
│   └── Remediation
├── Quick Start Preview
├── Documentation Portal
│   ├── Getting Started
│   ├── User Guides
│   ├── API Reference
│   ├── Examples
│   ├── Contributing
│   └── Architecture
└── Community & Support
    ├── GitHub
    ├── Issues
    └── Discussions
```

## Technical Approach

### Design Principles
1. **Simplicity First**: Start with single-page design, expand as needed
2. **Documentation-Centric**: Docs are primary content, easily accessible
3. **Minimal Disruption**: Use existing docs with minimal changes
4. **Repository-Based**: All content lives in this repo for version control
5. **Static Generation**: Fast, secure, easy to host
6. **Maintainability**: Easy for team to update without specialized knowledge
7. **Standards Compliance**: Follow CNCF and open source best practices

### Technology Considerations (To Be Decided)
Options to evaluate during implementation:
- **Docusaurus**: React-based, popular in CNCF projects
- **VitePress**: Vue-based, fast, good for single-page sites
- **MkDocs Material**: Python-based, excellent docs focus
- **Hugo**: Go-based, extremely fast, flexible

Evaluation criteria:
- Ease of integrating existing markdown docs
- Single-page site support
- CNCF project usage/examples
- Build performance
- Maintenance overhead
- Community support

### Content Strategy
1. **Existing Documentation**: Audit current docs in repo
2. **Minimal Changes**: Preserve content, adjust formatting only if needed
3. **Navigation Structure**: Create logical hierarchy for docs
4. **Homepage Content**: Write compelling project description
5. **SEO Optimization**: Metadata, descriptions, keywords
6. **Search Functionality**: Enable doc search for user convenience

### Hosting & Deployment
- **GitHub Pages** (default option) or **Netlify/Vercel**
- Automated deployment on push to main branch
- Custom domain if available (e.g., devops-ai-toolkit.io)
- HTTPS enabled
- CDN for global performance

## Implementation Plan

### Milestone 1: Content Audit & Planning
**Goal**: Understand existing docs and plan website structure

**Tasks**:
- Audit all documentation files in repository
- Identify documentation gaps or outdated content
- Create navigation hierarchy for documentation
- Define homepage sections and content
- Research CNCF website standards and examples
- Document content migration strategy

**Validation**:
- [ ] Complete inventory of existing documentation
- [ ] Proposed navigation structure reviewed
- [ ] Homepage content outline approved
- [ ] CNCF standards documented

### Milestone 2: Technology Selection & Setup
**Goal**: Choose platform and establish development environment

**Tasks**:
- Evaluate static site generator options
- Make technology decision based on criteria
- Set up project structure in repository
- Configure build and development scripts
- Set up local development environment
- Document technology choice rationale

**Validation**:
- [ ] Static site generator chosen and justified
- [ ] Project scaffolding complete
- [ ] Local development working
- [ ] Build process configured
- [ ] Team can run site locally

### Milestone 3: Homepage & Core Layout
**Goal**: Create compelling homepage with navigation structure

**Tasks**:
- Design and implement homepage layout
- Write homepage content (hero, features, quick start)
- Create documentation portal entry point
- Implement responsive design
- Add CNCF compliance elements
- Set up site-wide navigation

**Validation**:
- [ ] Homepage visually appealing and informative
- [ ] Mobile-responsive design verified
- [ ] Clear call-to-action for getting started
- [ ] Navigation structure implemented
- [ ] CNCF branding/badges included

### Milestone 4: Documentation Integration
**Goal**: Integrate all existing docs with minimal changes

**Tasks**:
- Migrate existing documentation files
- Configure documentation navigation
- Set up internal linking between docs
- Add search functionality
- Test all documentation pages
- Fix any formatting issues

**Validation**:
- [ ] All existing docs integrated successfully
- [ ] Documentation navigation works intuitively
- [ ] Search functionality operational
- [ ] No broken links or images
- [ ] Minimal changes to original content

### Milestone 5: Deployment & CI/CD
**Goal**: Automate deployment and make site publicly accessible

**Tasks**:
- Configure hosting platform (GitHub Pages/Netlify/Vercel)
- Set up automated deployment pipeline
- Configure custom domain (if available)
- Enable HTTPS
- Test deployment process
- Set up deployment notifications

**Validation**:
- [ ] Website publicly accessible
- [ ] HTTPS enabled and working
- [ ] Automated deployment on push to main
- [ ] Deployment process documented
- [ ] Domain configured (if applicable)

### Milestone 6: SEO & Performance Optimization
**Goal**: Ensure site is discoverable and performant

**Tasks**:
- Add meta descriptions and keywords
- Optimize images and assets
- Implement sitemap and robots.txt
- Test page load performance
- Add analytics (optional)
- Test SEO with tools (Lighthouse, etc.)

**Validation**:
- [ ] Lighthouse score > 90 for performance
- [ ] SEO meta tags on all pages
- [ ] Sitemap generated and submitted
- [ ] Fast load times verified
- [ ] Mobile performance tested

### Milestone 7: Documentation & Launch
**Goal**: Document website maintenance and launch publicly

**Tasks**:
- Create website maintenance guide
- Document how to add/update content
- Update main README with website link
- Announce website to community
- Update GitHub repository description
- Add website link to all relevant places

**Validation**:
- [ ] Maintenance documentation complete
- [ ] README updated with website link
- [ ] Community announcement made
- [ ] Repository description includes website
- [ ] Website link added to GitHub repo

## Dependencies

### Internal Dependencies
- Existing documentation in repository
- GitHub repository permissions for GitHub Pages
- Ability to modify repository settings

### External Dependencies
- Static site generator tooling (Node.js/Python/Go)
- Hosting platform (GitHub Pages/Netlify/Vercel)
- Domain name (optional but recommended)
- CNCF branding guidelines (for compliance)

### Integration Points
- GitHub Actions for CI/CD
- Repository documentation files
- CNCF resources (if applicable)

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Documentation requires significant restructuring | High | Medium | Thorough audit in Milestone 1; choose flexible static site generator |
| Technology choice doesn't meet needs | High | Low | Evaluate multiple options against clear criteria; prototype before committing |
| Poor performance or SEO | Medium | Low | Use proven static site generators; follow web performance best practices |
| Difficult for team to maintain | Medium | Medium | Choose technology familiar to team; extensive documentation in Milestone 7 |
| Hosting costs or limitations | Low | Low | Start with free GitHub Pages; evaluate alternatives if needed |
| Content becomes outdated | Medium | High | Document clear maintenance process; integrate with development workflow |

## Open Questions

1. **Domain Name**: Do we want a custom domain? If so, what domain and who manages it?
2. **Analytics**: Should we include website analytics? What privacy considerations?
3. **Internationalization**: English only for now, or plan for i18n?
4. **Community Features**: Should we integrate GitHub Discussions, Slack, or other community tools?
5. **Versioned Docs**: Do we need documentation versioning for different releases?
6. **API Documentation**: Should API docs be auto-generated from code or manually maintained?
7. **Examples Repository**: Should examples live in separate repo or integrated in main repo?

## Success Metrics

### Launch Metrics (First 30 Days)
- Website live and accessible
- All existing documentation migrated
- Zero critical bugs or broken links
- Positive initial feedback from team

### Adoption Metrics (3 Months)
- Page views and unique visitors
- Documentation page engagement
- Average time on site
- Bounce rate < 60%
- Search engine visibility

### Quality Metrics (Ongoing)
- Lighthouse performance score > 90
- Zero broken links
- Documentation kept up-to-date
- Fast build and deployment times
- Positive user feedback

## Timeline Estimate

**Total Estimated Duration**: 3-4 weeks (with dedicated focus)

- Milestone 1: 2-3 days
- Milestone 2: 2-3 days
- Milestone 3: 4-5 days
- Milestone 4: 3-4 days
- Milestone 5: 2-3 days
- Milestone 6: 2-3 days
- Milestone 7: 1-2 days

**Note**: Timeline assumes one developer working part-time. Adjust based on actual availability and complexity discovered during Milestone 1.

## Related PRDs

- **#173**: CNCF Foundation Submission - Website is critical for CNCF evaluation
- **#109**: Web UI for MCP Server Interaction - May share design elements
- **#45**: Infrastructure Deployment Documentation and User Experience - Related to docs UX
- **#165**: Guided Setup System - Getting started content for website

## Progress Log

### 2025-12-08 - PRD Closure: Superseded by Separate Repository
**Duration**: N/A (architectural decision)
**Status**: Closed - Superseded

**Closure Summary**:
This PRD originally proposed building the website within the dot-ai repository. After discussion, the architecture was revised to use a separate repository to:
- Keep dot-ai focused on MCP code only
- Support multi-project ecosystem (dot-ai, dot-ai-controller, future projects)
- Allow the website to aggregate documentation from multiple source repos

**Implementation Reference**:
- New repository: [dot-ai-website](https://github.com/vfarcic/dot-ai-website)
- New PRD: [dot-ai-website PRD #1](https://github.com/vfarcic/dot-ai-website/blob/main/prds/1-documentation-portal-website.md)

**Key Decisions**:
- Technology: Docusaurus (CNCF standard, multi-docs support)
- Architecture: Website fetches docs from source repos at build time
- Docs remain in source repos, website aggregates them

### 2025-10-24 - PRD Created
- Initial PRD created with 7 major milestones
- GitHub issue #179 opened
- Ready for review and discussion

---

**Last Updated**: 2025-12-08
**Status**: Closed - Superseded
**Closed**: 2025-12-08
**Superseded By**: [dot-ai-website PRD #1](https://github.com/vfarcic/dot-ai-website/issues/1)
