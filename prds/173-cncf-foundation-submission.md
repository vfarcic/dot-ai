# PRD #173: CNCF Foundation Submission

**GitHub Issue**: [#173](https://github.com/vfarcic/dot-ai/issues/173)
**Status**: Planning
**Priority**: Medium
**Created**: 2025-10-21
**Last Updated**: 2025-10-21

---

## Problem Statement

DevOps AI Toolkit has achieved technical maturity and initial adoption (147 stars, 28 forks, 442 commits in 6 months) but lacks the ecosystem presence, neutral governance structure, and community resources needed for long-term sustainability and widespread adoption in the cloud native ecosystem.

### Current State
- **Project Maturity**: Active development with 442 commits in 6 months, primarily single maintainer (Viktor Farcic)
- **Adoption**: 147 GitHub stars, 28 forks, 7 watchers - showing early interest but limited production evidence
- **Community**: Limited contributor base (3 contributors: Viktor Farcic, GitHub Action, renovate[bot])
- **Governance**: Informal governance under single maintainer/copyright holder
- **Ecosystem Integration**: Builds on Kubernetes, MCP, and AI providers but not part of CNCF ecosystem

### Problems to Solve
1. **Limited Visibility**: Project unknown to broader cloud native community
2. **Single Point of Failure**: Heavy dependence on single maintainer creates sustainability risk
3. **Governance Gaps**: Missing formal governance, contribution guidelines, security policies
4. **Community Growth**: Need structured approach to attract contributors and adopters
5. **Ecosystem Isolation**: Not recognized as part of cloud native ecosystem despite deep integration

---

## Proposed Solution

Submit DevOps AI Toolkit to CNCF Sandbox level, establishing the project as a recognized cloud native initiative with access to CNCF resources, community, and governance frameworks.

### CNCF Sandbox Overview
- **Purpose**: Entry point for early-stage innovative projects
- **Benefits**: Visibility, neutral governance foundation, CNCF infrastructure, legal/trademark support
- **Timeline**: Applications reviewed every 2 months, 7-10 projects per session
- **Success Rate**: 13 projects accepted in H2 2024 alone

### Why Sandbox (Not Incubating/Graduated)
- **Right fit for maturity level**: Experimental/innovative with growing but limited adoption
- **Community building time**: Sandbox provides runway to attract contributors and production users
- **Governance development**: Time to establish formal governance before incubation requirements

---

## Success Criteria

### Application Acceptance
- [ ] Complete CNCF Sandbox application submitted
- [ ] Application reviewed by TOC and assigned TAG
- [ ] Project accepted into CNCF Sandbox
- [ ] Onboarding issue opened by CNCF staff

### Pre-Submission Requirements Met
- [x] All required governance documents created and published
- [x] Project roadmap documented and publicly accessible
- [x] Contributing guidelines established
- [x] Code of Conduct adopted
- [x] Security policy documented
- [x] Maintainers file created
- [x] Issue templates created (bug report, feature request)
- [x] Pull request template created
- [ ] ADOPTERS.md file created (deferred - will create when needed)
- [x] Website URL decision made and documented
- [x] Community channel decision made (GitHub Discussions)
- [ ] Application materials prepared for all 30 form fields

### Post-Acceptance Success
- [ ] Project listed on CNCF Sandbox projects page
- [ ] Project trademarks transferred to CNCF (if applicable)
- [ ] CNCF infrastructure access established
- [ ] Community communication channels set up

---

## User Impact

### Platform Engineers
**Before**: Discover project through random blog posts or word-of-mouth
**After**: Find project as recognized CNCF Sandbox tool with credibility and community backing

### Contributors
**Before**: Uncertain about project governance, contribution process, long-term viability
**After**: Clear contribution path with neutral governance and CNCF backing ensures long-term sustainability

### Enterprise Adopters
**Before**: Hesitant to adopt single-maintainer project without governance or security policy
**After**: Confidence in CNCF-backed project with formal policies and community oversight

### DevOps AI Toolkit Project
**Before**: Isolated project with limited visibility and single-maintainer risk
**After**: Part of cloud native ecosystem with access to CNCF resources, community, and growth opportunities

---

## Technical Implementation

### Current Project Status

**Strengths**:
- ✅ MIT License (CNCF compatible)
- ✅ Active development (442 commits in 6 months)
- ✅ Clear technical value proposition (AI-powered Kubernetes deployment)
- ✅ Integration with cloud native ecosystem (Kubernetes, MCP)
- ✅ Comprehensive documentation

**Gaps** (required for submission):
- ❌ No CONTRIBUTING.md
- ❌ No CODE_OF_CONDUCT.md
- ❌ No SECURITY.md
- ❌ No MAINTAINERS.md or OWNERS file
- ❌ No GOVERNANCE.md
- ❌ No formal roadmap document
- ❌ No adopters list
- ❌ Limited contributor base

### CNCF Sandbox Application Requirements

The application form requires 30 fields across these categories:

#### 1. Basic Project Information (7 fields)
- Project summary (single line)
- Project description (100-300 words)
- Organization repo URL
- Project repo URL
- Additional repos (optional)
- Website URL
- Application contact emails

#### 2. Governance & Community (8 fields)
- Roadmap + context
- Contributing guide
- Code of Conduct
- Adopters file (optional)
- Maintainers file
- Security policy
- Standard/specification (if applicable)
- Product/service separation

#### 3. Cloud Native Context (7 fields)
- Why CNCF?
- Landscape benefit
- Cloud native fit
- Cloud native integration (complementary projects)
- Cloud native overlap (competing projects)
- Similar projects
- Landscape listing status

#### 4. Legal & Compliance (4 fields)
- Trademark donation agreement
- IP policy compliance
- License exception needs
- Signatory information

#### 5. Additional Information (4 fields)
- Domain Technical Review (TAG engagement)
- CNCF contacts
- Additional information
- Supplementary details

---

## Pre-Implementation Decisions

Before starting Milestone 1, these key decisions need to be made:

### Decision 1: Website URL Strategy
**Required for**: Application Form Field #6
**Options**:
- Use GitHub repository URL as website (simplest, common for Sandbox)
- Create GitHub Pages site
- Create dedicated project website

**Decision**: ✅ **Use GitHub repository URL** (https://github.com/vfarcic/dot-ai)
**Rationale**: Standard for CNCF Sandbox projects, zero setup time, comprehensive README serves as homepage, can upgrade post-acceptance

---

### Decision 2: Community Communication Channel
**Required for**: Milestone 3 deliverable, impacts CONTRIBUTING.md content
**Options**:
- GitHub Discussions (lightweight, integrated)
- CNCF Slack channel (requires acceptance first)
- Discord server
- No separate channel initially (GitHub Issues only)

**Decision**: ✅ **GitHub Discussions**
**Rationale**: Free, integrated with GitHub, searchable, standard for CNCF Sandbox projects, can add CNCF Slack after acceptance
**Action Required**: Enable GitHub Discussions in repository settings

---

### Decision 3: TAG Assignment Strategy
**Required for**: Application Form Field #27
**Options**:
- Request TAG-App-Delivery (best fit for deployment tool)
- Request TAG-Runtime
- Request TAG-Contributor-Strategy
- Let TOC assign automatically

**Decision**: ✅ **Let TOC assign automatically**
**Rationale**: Project scope is broader than single TAG domain (covers app deployment, infrastructure management, remediation, platform engineering). TOC has full context from application and can assign to most appropriate TAG (likely TAG-Runtime or TAG-App-Delivery)

---

## Milestones

### 1. Governance Documentation Complete
**Success Criteria**: All required governance documents created, reviewed, and published

**Deliverables**:
- CONTRIBUTING.md with clear contribution workflow
- CODE_OF_CONDUCT.md (adopt Contributor Covenant)
- SECURITY.md with vulnerability reporting process
- MAINTAINERS.md with current maintainer(s) and process
- GOVERNANCE.md outlining project governance structure
- ROADMAP.md with 6-12 month vision

**Validation**: All files exist in repository root and pass CNCF checklist review

---

### 2. Application Materials Prepared ✅
**Success Criteria**: All 30 application form fields have complete, accurate responses ready

**Deliverables** (organized by application form categories):
- [x] Basic Project Information (7 fields): descriptions, repo URLs, website, contacts
- [x] Governance & Community (8 fields): links to all governance docs, adopters file
- [x] Cloud Native Context (7 fields): CNCF fit, complementary projects, competitive analysis
- [x] Legal & Compliance (4 fields): trademark status, IP policy, license verification
- [x] Additional Information (4 fields): TAG identification, CNCF contacts, supplementary details

**Validation**: ✅ Application materials comprehensive and ready for submission

**Note**: All 30 fields are documented in `docs/CNCF_APPLICATION.md` with complete responses

---

### 3. Community Infrastructure Established ✅
**Success Criteria**: Basic community engagement channels and processes operational

**Deliverables**:
- [x] Issue templates for bug reports, feature requests
- [x] Pull request template
- [x] Discussion forums or Slack/Discord channel decision made
- [ ] ADOPTERS.md file (deferred - will create when needed)
- [x] Initial contributor documentation (covered by CONTRIBUTING.md - no additional docs needed initially)

**Validation**: ✅ First-time contributors can successfully find and follow contribution process

---

### 4. Application Submitted and Tracking Active
**Success Criteria**: Official CNCF Sandbox application submitted through GitHub form

**Deliverables**:
- Complete application submitted via cncf/sandbox issue form
- Application tracking issue number obtained
- TAG notification (if required)
- Application status monitoring process established

**Validation**: Application appears in cncf/sandbox repository with "New" status

---

### 5. TOC Review Response Managed
**Success Criteria**: All TOC and TAG questions answered promptly and completely

**Deliverables**:
- Responses to all TAG review questions
- Additional documentation if requested
- "Returning" status achieved after addressing feedback
- Follow-up communications maintained

**Validation**: Application moves from "Need-Info" or "TAG-Assigned" to "Returning" status

---

### 6. Acceptance and Onboarding Complete
**Success Criteria**: Project accepted to CNCF Sandbox with onboarding process completed

**Deliverables**:
- TOC approval vote recorded
- Onboarding issue opened by CNCF staff
- Onboarding checklist completed
- Trademark transfer completed (if applicable)
- Project listed on CNCF Sandbox page

**Validation**: Project appears on https://www.cncf.io/sandbox-projects/

---

## Timeline

### Phase 1: Preparation (Weeks 1-4)
- Week 1-2: Create all governance documents
- Week 3: Prepare application materials
- Week 4: Community infrastructure setup and internal review

### Phase 2: Submission (Week 5)
- Submit application through cncf/sandbox issue form
- Notify relevant TAG if required
- Begin monitoring application status

### Phase 3: Review & Response (Weeks 6-12)
- TOC review cycle (every ~2 months)
- Respond to TAG questions
- Address feedback and mark as "Returning"
- Wait for approval vote

### Phase 4: Onboarding (Weeks 13-16)
- Complete CNCF onboarding checklist
- Transfer trademarks
- Set up CNCF infrastructure access
- Announce acceptance

**Total Timeline**: 3-4 months from start to acceptance (estimated)

**Note**: Timeline assumes first-pass acceptance. If declined or postponed, may need to address feedback and resubmit, adding 2-4 months.

---

## Risks and Mitigations

### Risk: Application Declined or Postponed
**Impact**: High - delays ecosystem integration by 2-4 months
**Likelihood**: Medium - 54 projects in queue, selective acceptance
**Mitigation**:
- Thorough preparation of all materials
- Pre-submission review by CNCF-experienced advisors
- Address all governance gaps before submission
- Engage with relevant TAG early for feedback

### Risk: Insufficient Community Evidence
**Impact**: Medium - may be asked to demonstrate more adoption
**Likelihood**: Medium - currently single-maintainer project
**Mitigation**:
- Focus on technical innovation and unique value proposition
- Document existing users/adopters even if small number
- Highlight 147 stars and 28 forks as growing interest
- Emphasize sandbox as vehicle for community building

### Risk: Governance Overhead
**Impact**: Low - additional maintenance burden on maintainer
**Likelihood**: High - new processes add overhead
**Mitigation**:
- Keep initial governance lightweight and practical
- Adopt proven templates (Contributor Covenant, standard CoC)
- Document processes clearly to reduce ongoing questions
- Plan for gradual governance maturity over time

### Risk: Trademark Transfer Complications
**Impact**: Low - potential legal/administrative delays
**Likelihood**: Low - project name likely not trademarked
**Mitigation**:
- Clarify trademark status early in process
- Consult with legal if any uncertainty
- Consider name alternatives if issues arise

### Risk: TAG Review Delays
**Impact**: Medium - extends timeline by 1-2 months
**Likelihood**: Medium - depends on TAG availability
**Mitigation**:
- Identify relevant TAG early (likely TAG-App-Delivery)
- Engage proactively before formal application
- Be responsive to questions and feedback
- Maintain communication throughout process

---

## Alternatives Considered

### Alternative 1: Remain Independent Project
**Pros**: No governance overhead, maintain full control, no application process
**Cons**: Limited visibility, no ecosystem credibility, sustainability risks
**Decision**: Rejected - growth requires ecosystem participation

### Alternative 2: Join Different Foundation (Apache, Linux Foundation Direct)
**Pros**: Alternative governance options, different community dynamics
**Cons**: Less relevant ecosystem for Kubernetes/cloud native project, smaller reach
**Decision**: Rejected - CNCF is natural home for cloud native Kubernetes tooling

### Alternative 3: Wait for Larger Community First
**Pros**: Stronger application with more evidence, higher acceptance likelihood
**Cons**: Chicken-and-egg problem - need ecosystem presence to attract community
**Decision**: Rejected - Sandbox explicitly designed for early-stage community building

### Alternative 4: Target Incubating Level Directly
**Pros**: Skip sandbox stage, faster path to mature project status
**Cons**: Requires production adopters, mature governance, diverse contributors - not ready
**Decision**: Rejected - Sandbox is appropriate entry point for current maturity

---

## Open Questions

1. **TAG Assignment**: Which TAG should review this project? (Likely TAG-App-Delivery, but could be TAG-Runtime or TAG-Contributor-Strategy)

2. **Project Positioning**: Position as "AI-powered Kubernetes deployment tool" or broader "DevOps AI platform"? This affects competitive landscape analysis.

3. **Trademark Status**: Does "DevOps AI Toolkit" have any trademark registration? Need clarity for application.

4. **Production Adopters**: Can we identify any production users to strengthen application? Even informal usage counts.

5. **Maintainer Expansion**: Should we recruit additional maintainers before submission to show community growth potential?

6. **Name Considerations**: Does "DevOps AI Toolkit" conflict with any existing CNCF projects? Should we consider name alternatives?

7. **Timing Strategy**: Submit immediately when ready, or wait for specific TOC review cycle? (~every 2 months)

8. **Community Channels**: Set up Slack workspace, Discord server, or use GitHub Discussions? What's minimum viable community infrastructure?

---

## Dependencies

### Upstream Dependencies
- **CNCF TOC Process**: Dependent on TOC review schedule and priorities
- **TAG Availability**: Assigned TAG must have bandwidth to review application
- **Kubernetes Evolution**: Project value tied to Kubernetes ecosystem relevance

### Internal Dependencies
- **Maintainer Time**: Viktor Farcic availability for governance doc creation and application process
- **Documentation Quality**: Existing docs must be polished for external review
- **Code Stability**: No major breaking changes during application period

### Blocking Dependencies
- **MIT License Verification**: Confirm all code/dependencies are CNCF-compatible licenses
- **Legal Review**: Trademark and IP policy compliance verification
- **Repository Access**: Ensure repository remains public and accessible

---

## Success Metrics

### Application Success
- [ ] Application submitted within 4 weeks of starting
- [ ] Zero "missing information" feedback from initial review
- [ ] TAG review completed within 30 days of assignment
- [ ] Acceptance on first TOC vote (no resubmission needed)

### Community Impact (Post-Acceptance, 6 months)
- 250+ GitHub stars (70% increase)
- 5+ external contributors with merged PRs
- 50+ forks (78% increase)
- 3+ documented production adopters

### Ecosystem Integration (Post-Acceptance, 6 months)
- Listed on Cloud Native Landscape
- Mentioned in CNCF blog or newsletter
- Presented at CNCF meetup or conference
- Integration with 2+ other CNCF projects documented

### Governance Maturity (Post-Acceptance, 12 months)
- 3+ maintainers from different organizations
- Formal release process established
- Security policy tested with vulnerability report
- Contributing guide validated by 10+ first-time contributors

---

## Progress Log

### 2025-10-25: Implementation Started
**Branch**: feature/prd-173-cncf-foundation-submission
**Commits**: 2 commits (decision documentation, README refactoring)

**Completed Work**:
- Made all 3 pre-implementation decisions (website URL, community channel, TAG assignment)
- Refactored README.md for CNCF compliance (193 → 125 lines, 35% reduction)
- Added CNCF-required sections: Mission, Scope, Acknowledgments
- Condensed verbose sections and removed duplication
- Created feature branch for CNCF submission work

**README Improvements**:
- Added project status badges (License, Beta status)
- Updated tagline to accurately reflect platform engineering and DevOps automation
- Improved "Who Should Use This?" clarity and conciseness
- Added comprehensive Documentation section with learning path
- Removed detailed troubleshooting (linked to docs instead)

**Next Session Priority**: Begin Milestone 1 - Create 6 governance documents using project setup MCP tool

### 2025-10-26: Milestone 3 Complete - Community Infrastructure Established
**Duration**: ~2 hours
**Scope**: GitHub templates, automation, and README enhancements

**Completed PRD Items**:
- [x] Milestone 3: Community Infrastructure Established (100% complete)
- [x] Issue templates (bug report, feature request, config)
- [x] Pull request template with DCO, Conventional Commits, security checklist
- [x] CODEOWNERS and release.yml for GitHub community features
- [x] OpenSSF Scorecard workflow for security best practices
- [x] Labeler and stale workflows for automated PR/issue management

**Additional Work Done**:
- Enhanced README.md with comprehensive badge set (npm, downloads, release, scorecard, stars)
- Customized labeler.yml for Node.js/Kubernetes project (removed irrelevant languages)
- Configured stale bot with conservative timelines (60 days issues, 30 days PRs)

**Files Created** (10 files):
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/CODEOWNERS`
- `.github/release.yml`
- `.github/workflows/scorecard.yml`
- `.github/labeler.yml`
- `.github/workflows/labeler.yml`
- `.github/workflows/stale.yml`

**Next Session Priority**: Milestone 2 complete! Ready for final review and submission preparation (Milestone 4)

### 2025-01-26: Milestone 2 Complete - Application Materials Prepared
**Duration**: ~4 hours
**Scope**: CNCF Sandbox application materials, documentation accuracy review

**Completed PRD Items**:
- [x] Milestone 2: Application Materials Prepared (100% complete)
- [x] All 30 application form fields completed with comprehensive responses
- [x] Conducted similar projects research (K8sGPT, HolmesGPT, Botkube, Kagent)
- [x] CNCF TOC and community contacts research and analysis
- [x] Trademark verification (no conflicts found)

**Application Document Created**:
- `docs/CNCF_APPLICATION.md` (55 pages, 9,500+ words)
- All 5 sections complete: Basic Info, Governance, Cloud Native Context, Legal, Additional Info
- Ready for copy-paste into CNCF GitHub issue form

**Documentation Accuracy Improvements**:
- Updated README.md to emphasize capability-driven universal approach
- Clarified that provisioning works with ANY operators on ANY infrastructure (not just AWS/Azure/GCP)
- Updated CNCF application to reflect universality and flexibility
- Updated mcp-tools-overview.md for infrastructure provisioning clarity
- Ensured all tools (provisioning, remediation, governance, project setup, prompts) properly represented

**Key Clarifications Made**:
- Infrastructure provisioning works with resources inside cluster AND outside through any operators
- Not prescriptive about specific operators (Crossplane/ACK/ClusterAPI are examples, not requirements)
- Works with any MCP-compatible AI agents (not limited to Claude Code/Cursor/VS Code)
- Comprehensive platform vs. single-purpose tools (provisioning + remediation + governance + project setup)

**Next Session Priority**: Final review, then proceed to Milestone 4 - Application submission

### 2025-10-25: PRD Enhancement
- **PRD Enhancement**: Updated Success Criteria to include all Milestone 3 deliverables with explicit checkboxes
- **Decision Framework**: Added Pre-Implementation Decisions section for key choices (website URL, community channel, TAG strategy)
- **Tracking Improvements**: Clarified ambiguous items, added category breakdown for 30 application fields
- **Implementation Ready**: PRD now complete and unambiguous, ready for implementation to begin

### 2025-10-21
- **Research Phase Complete**: Investigated CNCF Sandbox requirements and application process
- **Gap Analysis**: Identified missing governance documents and community infrastructure
- **Timeline Defined**: 3-4 month estimated timeline from start to acceptance
- **Application Form Analysis**: Documented all 30 required form fields
- **Project Metrics Gathered**: 147 stars, 28 forks, 442 commits (6 months), 3 contributors

---

## Additional Context

### Why This Matters Now

**Market Timing**: AI-powered DevOps tools are hot topic in cloud native ecosystem. Submitting now positions project in emerging category rather than catching up later.

**Kubernetes Evolution**: Kubernetes operators and CRDs are becoming more complex. DevOps AI Toolkit's capability discovery and semantic matching address real pain points.

**MCP Ecosystem Growth**: Model Context Protocol adoption is accelerating. Being early CNCF project with MCP integration creates differentiation.

**Governance Urgency**: Project approaching size where informal governance becomes bottleneck. Better to establish structure proactively.

### Strategic Value

**For CNCF**: First sandbox project bridging AI agents (MCP) with Kubernetes deployment. Demonstrates cloud native innovation in AI era.

**For Project**: Credibility boost accelerates adoption. Governance structure enables scaling beyond single maintainer.

**For Ecosystem**: Lowers barrier to Kubernetes adoption through AI assistance. Enables platform engineers to codify institutional knowledge.

### Learning Opportunities

**Governance Experience**: Building governance documents provides template for future cloud native projects
**Community Building**: Sandbox phase teaches community development and contributor engagement
**Ecosystem Navigation**: Understanding CNCF processes valuable for future project involvement

---

## References

- [CNCF Sandbox Application Process](https://github.com/cncf/sandbox)
- [CNCF TOC Process Documentation](https://github.com/cncf/toc/tree/main/process)
- [CNCF Sandbox Projects List](https://www.cncf.io/sandbox-projects/)
- [CNCF IP Policy](https://github.com/cncf/foundation/blob/master/charter.md)
- [CNCF Services for Projects](https://www.cncf.io/services-for-projects/)
- [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/)
- [OpenSSF Security Policy Template](https://github.com/ossf/security-policy-template)

---

## Next Steps

**Immediate Actions**:
1. Make Pre-Implementation Decisions (3 key decisions documented above)
2. Create feature branch: `feature/prd-173-cncf-foundation-submission`
3. Begin Milestone 1: Create all 6 governance documents
4. Commit and mark Milestone 1 checkboxes complete

**Then**:
- Milestone 2: Prepare all 30 application form fields
- Milestone 3: Set up community infrastructure
- Milestone 4: Submit CNCF Sandbox application
