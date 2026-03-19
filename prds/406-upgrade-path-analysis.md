# PRD: Upgrade Path Analysis

**Issue**: #406
**Created**: 2026-03-13
**Status**: Planning
**Priority**: Medium
**Owner**: TBD

## Executive Summary

Assess cluster readiness for Kubernetes version upgrades using existing tools (kubectl_api_resources, kubectl_get_crd_schema, capability scan) combined with API deprecation data. Produce a single upgrade readiness report identifying deprecated APIs in use, incompatible operators, and required actions.

## Problem Statement

Kubernetes version upgrades are risky without knowing which deprecated APIs are in use, which operators may be incompatible, and what CRDs need attention. Users manually piece this together from multiple sources — release notes, deprecation guides, and cluster inspection. This is time-consuming and error-prone.

## Success Criteria

- Single command/query produces an upgrade readiness assessment for a target Kubernetes version
- Identifies deprecated/removed APIs currently in use in the cluster
- Flags operators and CRDs that may need attention
- Provides actionable items (not just warnings)
- Leverages existing tools — no new cluster-side dependencies required

## Solution Overview

- Use existing kubectl_api_resources, CRD schemas, and capability scan to inventory cluster state
- Compare against Kubernetes API deprecation data for the target version
- Scan stored manifests and live resources for deprecated API usage
- Generate readiness report with specific actions per affected resource
- Details to be discussed as the first milestone task

## Milestones

- [ ] Milestone 1: Discovery & design — define deprecation data source, report format, and integration points with existing tools
- [ ] Milestone 2: API deprecation detection — scan cluster for resources using deprecated/removed APIs for a target version
- [ ] Milestone 3: Operator & CRD compatibility check — assess installed operators against target version compatibility
- [ ] Milestone 4: Readiness report generation — produce actionable upgrade readiness report with prioritized items
- [ ] Milestone 5: Integration with query — answer upgrade questions via natural language ("can I upgrade to 1.32?")
- [ ] Milestone 6: Integration tests and documentation
