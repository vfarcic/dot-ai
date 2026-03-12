# PRD: Dependency & Impact Analysis

**Issue**: #405
**Created**: 2026-03-13
**Status**: Planning
**Priority**: Medium
**Owner**: TBD

## Executive Summary

Map resource dependencies before operations to prevent cascading failures. Surface impact analysis within query, operate, and remediate workflows — showing what resources are affected before any destructive or modifying action is taken.

## Problem Statement

Users have no way to understand the blast radius of operations. Deleting a PVC, upgrading a CRD, or scaling a deployment can have cascading effects that are invisible until something breaks. The operate and remediate tools execute changes without showing downstream dependencies.

## Success Criteria

- Dependency mapping available for common resource relationships (Deployment→ReplicaSet→Pod, PVC→Pod, Service→Endpoints, CRD→CRs)
- Impact analysis surfaced before destructive operations in operate workflow
- Queryable via natural language ("what depends on this PVC?")
- Works with both built-in Kubernetes resources and CRDs

## Solution Overview

- Build dependency graph from ownerReferences, label selectors, volume mounts, and service selectors
- Surface impact analysis in operate before delete/update operations
- Integrate with query for ad-hoc dependency questions
- Details to be discussed as the first milestone task

## Milestones

- [ ] Milestone 1: Discovery & design — map all dependency relationship types in Kubernetes, define graph model, agree on UX
- [ ] Milestone 2: Core dependency graph — build resource relationship mapping from ownerReferences, selectors, and volume mounts
- [ ] Milestone 3: Impact analysis in operate — surface "this will affect X resources" before destructive operations
- [ ] Milestone 4: Query integration — answer dependency questions via natural language ("what depends on this database?")
- [ ] Milestone 5: CRD relationship support — extend dependency mapping to custom resources
- [ ] Milestone 6: Integration tests and documentation
