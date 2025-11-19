# PRD #75: Test Performance Analysis & Optimization Tool

**Status**: Closed
**Priority**: Low
**Created**: 2025-08-22
**Closed**: 2025-11-19
**GitHub Issue**: [#75](https://github.com/vfarcic/dot-ai/issues/75)  

## Work Log

### 2025-11-19: PRD Closure - Deferred
**Status**: Closed / Deferred

**Closure Summary**:
This PRD proposed building a custom test performance analysis tool. While valuable, no implementation work has started, and the project priority has shifted towards core product features (like the Controller architecture in PRD #216).

**Reasoning**:
- **Prioritization**: Core features take precedence over internal tooling.
- **Alternative**: Developers can use standard Vitest profiling and reporting tools for now.
- **Maintenance**: Building and maintaining a custom analysis tool is a high overhead.

This initiative is deferred indefinitely.

## Executive Summary

### Problem Statement
Developers lack visibility into test performance bottlenecks in the dot-ai project's comprehensive test suite (845+ tests). Without automated analysis, it's difficult to:
- Identify which tests are genuinely slow vs. expected to be slow
- Understand root causes of test performance issues
- Get actionable recommendations for optimization
- Detect redundant or unnecessary tests that could be removed
- Track test performance regression over time

### Solution Overview
Create an intelligent test performance analyzer that integrates with the existing Jest test suite to provide automated analysis, insights, and optimization recommendations for test performance.

### Success Metrics
- **Performance**: Reduce overall test suite runtime by 20%+ through optimization
- **Developer Experience**: Provide clear, actionable insights in <5 minutes analysis time
- **Quality**: Maintain 100% test coverage while optimizing performance
- **Automation**: Zero manual intervention required for basic analysis

## Business Context

### User Impact
- **Primary Users**: dot-ai developers and contributors
- **Secondary Users**: CI/CD pipeline efficiency (GitHub Actions)
- **Value Proposition**: Faster development cycles, reduced CI costs, improved developer productivity

### Strategic Alignment
Supports the dot-ai project's mission of AI-powered development productivity by applying intelligent analysis to the development workflow itself.

## Detailed Requirements

### Core Functionality

#### 1. Test Performance Detection
- **Configurable Thresholds**: Default >2s for individual tests, >10s for test suites
- **Baseline Comparison**: Compare against historical performance data
- **Statistical Analysis**: Identify performance outliers and trends
- **Context Awareness**: Understand when slow tests are expected (integration tests vs unit tests)

#### 2. Root Cause Analysis
- **Common Pattern Detection**:
  - Unnecessary async/await operations
  - Missing mocks for external services
  - Redundant setup/teardown operations
  - Database/filesystem operations in unit tests
  - Large fixture loading
  - Expensive computation in test setup

- **Resource Usage Analysis**:
  - Memory consumption patterns
  - CPU-intensive operations
  - Network calls and timeouts
  - File I/O operations

#### 3. Optimization Recommendations
- **Specific Actionable Suggestions**:
  - "Mock the ClaudeIntegration API calls in test X"
  - "Move expensive setup to beforeAll instead of beforeEach"
  - "Consider using shallow rendering for component test Y"
  - "Replace real filesystem operations with in-memory alternatives"

- **Code Examples**: Provide before/after code snippets for common optimizations
- **Priority Ranking**: Sort recommendations by expected impact

#### 4. Test Redundancy Detection
- **Duplicate Test Logic**: Identify tests that verify the same functionality
- **Over-Testing**: Flag areas with excessive test coverage that don't add value
- **Obsolete Tests**: Detect tests for removed or significantly changed functionality

### Integration Requirements

#### Jest Integration
- **Custom Reporter**: Seamless integration with existing `npm test` workflow
- **Zero Config**: Works out-of-the-box with current Jest setup
- **Non-Intrusive**: No impact on test execution performance

#### CI/CD Integration  
- **GitHub Actions**: Report performance regressions in PR checks
- **Threshold Enforcement**: Fail builds if test performance degrades significantly
- **Historical Tracking**: Store and compare performance metrics over time

### Output & Reporting

#### Terminal Output
```
🔍 Test Performance Analysis Complete

📊 Summary:
  Total Tests: 845
  Slow Tests: 12 (>2s)
  Very Slow Tests: 3 (>5s)
  Potential Savings: 45s (estimated)

🐌 Slowest Tests:
  1. answer-question.test.ts (23.4s) - Multiple Claude API calls without mocks
  2. schema.test.ts (17.1s) - Large fixture loading in each test
  3. build-system.test.ts (18.3s) - Real filesystem operations

💡 Top Recommendations:
  1. Mock Claude API in answer-question.test.ts (save ~20s)
  2. Use beforeAll for fixture loading in schema.test.ts (save ~12s)
  3. Use in-memory filesystem for build-system.test.ts (save ~15s)

📋 Detailed report saved to: test-performance-report.json
```

#### JSON Report Format
```json
{
  "timestamp": "2025-08-22T10:00:00Z",
  "summary": {
    "totalTests": 845,
    "slowTests": 12,
    "verySlow": 3,
    "totalRuntime": 24511,
    "estimatedSavings": 45000
  },
  "slowTests": [
    {
      "testFile": "tests/tools/answer-question.test.ts",
      "runtime": 23400,
      "issues": [
        {
          "type": "unmocked_api_calls",
          "description": "Multiple Claude API calls without mocks",
          "recommendation": "Add Claude API mocks to test setup",
          "estimatedSaving": 20000,
          "priority": "high"
        }
      ]
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "type": "mock_api",
      "file": "tests/tools/answer-question.test.ts",
      "description": "Mock Claude API in answer-question.test.ts",
      "estimatedSaving": 20000,
      "codeExample": {
        "before": "// Real API call",
        "after": "// Mocked API call"
      }
    }
  ]
}
```

## Technical Architecture

### Analysis Engine Components

#### 1. Performance Data Collection
- **Jest Reporter Hook**: Capture timing data for each test
- **System Resource Monitor**: Track memory/CPU usage during tests
- **Call Stack Analysis**: Identify expensive operations within tests

#### 2. Pattern Recognition System
- **Static Code Analysis**: Parse test files for common performance anti-patterns
- **Runtime Behavior Analysis**: Analyze actual test execution patterns
- **Historical Data Comparison**: Compare against previous runs

#### 3. Recommendation Engine
- **Rule-Based System**: Apply predefined optimization rules
- **Machine Learning Insights**: Learn from successful optimizations
- **Context-Aware Suggestions**: Consider test type and project structure

### File Structure
```
src/
  performance/
    analyzer.ts          # Main analysis engine
    collector.ts         # Performance data collection
    patterns.ts          # Common performance patterns
    recommendations.ts   # Optimization suggestions
    reporter.ts          # Jest reporter integration
    types.ts            # TypeScript interfaces
  
tests/
  performance/
    analyzer.test.ts     # Core functionality tests
    integration.test.ts  # End-to-end workflow tests
    
docs/
  developer-tools/
    test-performance.md  # User documentation
```

## Implementation Milestones

### Milestone 1: Core Performance Detection Engine ⏱️ 2 weeks
- **Deliverable**: Basic slow test detection with configurable thresholds
- **Success Criteria**: 
  - Accurately identifies tests >2s runtime
  - Provides basic timing analysis
  - Integrates with existing Jest workflow
- **Validation**: Can detect and report the 10 slowest tests in current suite

### Milestone 2: Root Cause Analysis System ⏱️ 2 weeks  
- **Deliverable**: Pattern recognition for common performance issues
- **Success Criteria**:
  - Detects unmocked API calls, expensive setup, file I/O patterns
  - Provides specific issue descriptions
  - Categories issues by type and severity
- **Validation**: Correctly identifies performance issues in 80% of slow tests

### Milestone 3: Actionable Recommendations Engine ⏱️ 2 weeks
- **Deliverable**: Specific optimization suggestions with code examples
- **Success Criteria**:
  - Generates actionable recommendations for identified issues  
  - Provides before/after code examples
  - Estimates performance impact of each suggestion
- **Validation**: Recommendations lead to measurable performance improvements when applied

### Milestone 4: Complete Documentation & User Experience ⏱️ 1 week
- **Deliverable**: Comprehensive documentation and intuitive user interface
- **Success Criteria**:
  - Complete user documentation with examples
  - Clear terminal output and JSON reports
  - Integration with existing development workflow documented
- **Validation**: New developers can use the tool effectively within 5 minutes

### Milestone 5: Advanced Analysis & CI Integration ⏱️ 2 weeks
- **Deliverable**: Advanced features and CI/CD pipeline integration
- **Success Criteria**:
  - Test redundancy detection
  - Historical performance tracking  
  - GitHub Actions integration for PR checks
  - Performance regression detection
- **Validation**: Successfully prevents performance regressions in CI pipeline

### Milestone 6: Optimization & Production Readiness ⏱️ 1 week
- **Deliverable**: Production-ready tool with comprehensive testing
- **Success Criteria**:
  - Zero impact on test execution performance
  - Comprehensive error handling and edge cases
  - Full test coverage for the analysis tool itself
- **Validation**: Tool runs reliably in production environment with 845+ tests

## Risk Assessment

### Technical Risks
- **Jest Integration Complexity**: Custom reporters may conflict with existing setup
  - *Mitigation*: Thorough testing with current Jest configuration, fallback options
- **Performance Impact**: Analysis tool could slow down test execution
  - *Mitigation*: Lightweight data collection, post-execution analysis
- **False Positives**: Tool may flag legitimate slow tests as problematic
  - *Mitigation*: Context-aware analysis, configurable thresholds

### Project Risks  
- **Maintenance Overhead**: Additional tooling increases project complexity
  - *Mitigation*: Comprehensive documentation, automated testing of the tool itself
- **Developer Adoption**: Tool may not be used if not integrated smoothly
  - *Mitigation*: Zero-config setup, clear value demonstration

## Success Criteria & Validation

### Quantitative Metrics
- **Performance Improvement**: 20%+ reduction in total test suite runtime
- **Analysis Speed**: Complete analysis in <5 minutes for 845+ tests  
- **Accuracy**: 90%+ of recommendations result in measurable improvements
- **Coverage**: Analyzes 100% of test files without false negatives

### Qualitative Metrics
- **Developer Feedback**: Positive reception from team members
- **Usability**: New contributors can use tool without extensive training
- **Integration**: Seamless workflow integration without disruption

### Validation Methods
- **A/B Testing**: Compare test suite performance before/after optimizations
- **Developer Surveys**: Collect feedback on tool usefulness and ease of use
- **CI Metrics**: Track build time improvements in GitHub Actions
- **Code Review**: Validate that recommendations align with best practices

## Future Enhancements (Post-MVP)

### Advanced Analytics
- **Performance Trends**: Long-term performance tracking and visualization
- **Comparative Analysis**: Compare test performance across branches/PRs
- **Resource Optimization**: Memory usage analysis and optimization

### Integration Expansions  
- **IDE Integration**: Real-time performance insights in development environment
- **Code Quality Integration**: Combine with linting/quality tools
- **Team Analytics**: Team-wide test performance dashboards

### AI-Powered Insights
- **Machine Learning**: Learn from optimization patterns to improve recommendations
- **Predictive Analysis**: Predict which tests will become slow based on code changes
- **Automated Fixes**: Generate automated optimization pull requests

## Decision Log

### ❌ Decision: Custom Kind Cluster Image for Integration Test Optimization (Rejected)
- **Date**: 2025-10-04
- **Status**: Rejected
- **Decision**: Create a custom Kind cluster Docker image with pre-installed operators (CloudNativePG, Kyverno) to reduce integration test setup time
- **Context**:
  - Current integration test workflow recreates Kind cluster for every test run
  - Cluster creation + operator installation takes ~45 seconds per run
  - Tests run frequently during multi-provider development (PRD-73), causing repeated cluster setup overhead
  - Current workflow: Delete cluster → Create cluster → Install CNI/Storage → Install CloudNativePG (async) → Install Kyverno (synchronous with 300s wait)
- **Rationale**:
  - **Time Savings**: Eliminate ~45 seconds of setup time per test run (30% faster developer feedback loop)
  - **Consistency**: Pre-installed operators ensure identical test environment every time
  - **Developer Experience**: Faster test iterations during active development
  - **CI Efficiency**: Reduced CI pipeline duration for PRs with integration test runs
- **Implementation Requirements**:
  - **Multi-Architecture Support**: Image must work on both ARM64 (M1/M2 Macs) and AMD64 (CI runners)
  - **Image Building**:
    - Create Dockerfile based on `kindest/node:v1.34.0`
    - Pre-install CloudNativePG operator manifests
    - Pre-install Kyverno Helm chart
    - Build and push multi-arch image to container registry (Docker Hub or GHCR)
  - **Script Updates**:
    - Update `tests/integration/infrastructure/run-integration-tests.sh`
    - Replace standard Kind node image with custom image in cluster creation
    - Remove operator installation steps (lines 99-111 in current script)
    - Verify operators are running before proceeding to tests
  - **Documentation**:
    - Document custom image building process
    - Provide instructions for rebuilding image when operator versions update
    - Update integration test documentation
- **Trade-offs**:
  - **Pros**:
    - Significant time savings during development
    - More consistent test environment
    - Simpler test script (fewer installation steps)
  - **Cons**:
    - Additional maintenance: Image needs rebuilding when operators update
    - Image distribution: Requires public registry or developer authentication
    - Image size: Larger image to pull initially (offset by faster subsequent runs)
- **Impact on PRD**:
  - **Milestone 1**: Add "Custom Cluster Image" task to infrastructure optimization milestone
  - **Success Metrics**: Update performance benchmarks to reflect 45-second improvement
  - **Integration Points**: Add "Custom Docker Image" section to CI/CD integration
- **Estimated Savings**:
  - Per-run: ~45 seconds (30% improvement for typical test run)
  - Developer workflow: 4-5 minutes saved over 10 test runs
  - CI pipeline: 45 seconds per integration test job
- **Rejection Rationale**:
  - **Marginal Benefit**: 45-second savings on 3-10 minute test runs (7-25% of setup, minimal impact on total time)
  - **High Complexity**: Multi-arch builds, image maintenance, CI pipelines, distribution, authentication
  - **Maintenance Burden**: Image needs rebuilding when operators update (ongoing overhead)
  - **Low Frequency**: Integration tests run only a few times per day during development
  - **AI Dominates Runtime**: Test execution time (3-10 minutes) far exceeds setup time (45 seconds)
  - **Simplicity Over Optimization**: Maintenance burden outweighs practical benefit
- **Alternative**: Accept 45-second setup time as reasonable for comprehensive integration testing
- **Owner**: Development Team

---

## Appendices

### A. Current Test Suite Analysis

#### Integration Tests (Only Test Type in Project)
- **Total Tests**: 44 integration tests (as of 2025-10-04)
- **Test Suites**: 7 test files
- **Current Setup Time**: ~45 seconds (Kind cluster + operator installation)
- **Current Total Runtime**: ~3-10 minutes (varies by AI provider speed)
- **Test Infrastructure**:
  - Kind cluster (v1.34.0) with CNI and Storage
  - CloudNativePG operator (async installation)
  - Kyverno Policy Engine (synchronous with 300s timeout)
  - Qdrant vector database (Docker container)
  - MCP server with HTTP transport
- **Provider Testing Status** (PRD-73):
  - ✅ Anthropic Claude: 44/44 passing (100%)
  - 🔄 Google Gemini: In progress (fixes applied, validation running)
  - ⏳ OpenAI: Not yet tested
- **Optimization Opportunity**: Custom Kind cluster image could reduce setup time by ~45 seconds (see Decision Log)

### B. Performance Benchmarks

#### Integration Tests
- **Target**: <5 minutes total test runtime (excluding cluster setup)
- **Individual Test Threshold**: 300 seconds (AI-intensive operations like capability scanning)
- **Setup Time Current**: ~45 seconds (cluster creation + operator installation)
- **Setup Time Target**: <30 seconds (with custom cluster image optimization)
- **CI Build Time Target**: <10 minutes total (including cluster setup)

### C. Integration Points
- **Test Framework**: Vitest (vitest.integration.config.ts)
- **Test Script**: `tests/integration/infrastructure/run-integration-tests.sh`
- **Real Cluster Validation**: Kind cluster with actual Kubernetes operators
- **Multi-Provider Support** (in progress): Tests run against different AI providers
- **CI/CD**: GitHub Actions workflows
- **Development Workflow**: CLAUDE.md requirements
- **Documentation**: README.md, docs/ structure