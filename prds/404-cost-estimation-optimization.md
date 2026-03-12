# PRD: Cost Estimation & Optimization

**Issue**: #404
**Created**: 2026-03-13
**Status**: Planning
**Priority**: Medium
**Owner**: TBD

## Executive Summary

Integrate with existing cost tools (OpenCost, Kubecost) to surface cost insights within the recommend and operate workflows. Provide cost estimates before deploying and right-sizing recommendations for running workloads. We do not build a cost engine — we query existing ones and present insights at decision points.

## Problem Statement

Users deploying and managing workloads through dot-ai have no cost visibility. They cannot estimate costs before deploying, compare cost implications of different solutions during the recommend workflow, or identify over-provisioned workloads through operate.

## Success Criteria

- Cost estimates surfaced during the recommend workflow when a cost tool is available in the cluster
- Right-sizing recommendations available through operate for running workloads
- Graceful degradation when no cost tool is installed (feature simply not available)
- Integration with at least one cost tool (OpenCost or Kubecost)

## Solution Overview

- Detect cost tool availability during capability scan
- Query cost APIs to estimate deployment costs based on resource requests/limits
- Surface cost data in recommend workflow (per-solution cost comparison)
- Surface right-sizing opportunities in operate workflow
- Details to be discussed as the first milestone task

## Milestones

- [ ] Milestone 1: Discovery & design — investigate OpenCost/Kubecost APIs, define integration points, agree on UX for cost surfacing
- [ ] Milestone 2: Cost tool detection — detect installed cost tools via capability scan
- [ ] Milestone 3: Cost estimation in recommend — query cost APIs and surface estimates when comparing solutions
- [ ] Milestone 4: Right-sizing in operate — analyze running workloads and suggest resource adjustments
- [ ] Milestone 5: Integration tests and documentation
