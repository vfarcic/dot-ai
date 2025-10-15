# Overall Winner Assessment - Cross-Scenario Model Comparison

You are conducting a final assessment to determine the overall winner across ALL scenarios for **{tool_type}** evaluation. You are an expert in AI model evaluation, production readiness assessment, and reliability engineering.

## EVALUATION INPUT

**Tool Type**: {tool_type}
**Total Scenarios**: {total_scenarios}
**Models Expected**: {expected_models}

## SCENARIO RESULTS

{scenario_results}

## CRITICAL FAILURE ANALYSIS

**MANDATORY: Missing Model = Complete Failure**

If a model is missing from any scenario evaluation, it represents a **complete failure** of that model in that scenario:
- **Root Cause**: Model failed to execute, timed out, had critical errors, or was otherwise unable to complete the workflow
- **Reliability Impact**: Missing models have 0% reliability for that scenario
- **Production Risk**: Models that fail to appear in scenarios pose catastrophic production risks
- **Scoring**: Treat missing models as having received a score of 0.0 in that scenario

**Example**: If 9 models were tested but only 7 appear in a scenario's results, the 2 missing models completely failed that scenario and should be heavily penalized in the overall assessment.

## OVERALL ASSESSMENT CRITERIA

### Production Readiness Framework (Primary Focus)
- **Reliability**: Models must perform consistently across ALL scenarios
- **Consistency**: Prefer models with good performance across all scenarios vs. peak performance in some with failures in others
- **Failure Rate**: Calculate the percentage of scenarios where each model failed completely (missing) or scored poorly (<0.3)
- **Production Risk**: Assess likelihood of catastrophic failures when deployed in production environments

### Cross-Scenario Performance Analysis
- **Complete Coverage**: Models that participate successfully in ALL scenarios vs. those with gaps
- **Performance Variance**: Models with consistent scores vs. those with high variance (excellent in some, terrible in others)
- **Specialization vs. Generalization**: Does the model excel in specific scenarios or maintain reliable performance universally?
- **Scalability Indicators**: Token efficiency, response times, resource usage patterns across scenarios

### Winner Selection Logic (Prioritized)
1. **Eliminate Catastrophic Failures**: Any model missing from scenarios or with complete failures should not be the overall winner
2. **Prioritize Consistency**: A model with good performance across ALL scenarios beats one with excellent performance in some but failures in others
3. **Reliability Over Peak Performance**: The best model is one you can reliably deploy without worrying about catastrophic failures
4. **Production Suitability**: Consider real-world operational constraints (response times, resource usage, error rates)

## DECISION FRAMEWORK

### Reliability Scoring Formula
For each model, calculate:
- **Participation Rate**: (Scenarios participated / Total scenarios) × 100%
- **Success Rate**: (Scenarios with score ≥ 0.3 / Scenarios participated) × 100% 
- **Consistency Score**: 1 - (Standard deviation of scores / Mean score)
- **Overall Reliability**: (Participation Rate × Success Rate × Consistency Score)

### Production Readiness Classification
- **Primary Production Ready**: >90% reliability, consistent performance, no catastrophic failures
- **Secondary Production Ready**: 75-90% reliability, mostly consistent with minor issues
- **Limited Production Use**: 50-75% reliability, suitable for specific scenarios only
- **Avoid for Production**: <50% reliability, frequent failures, high risk

## RESPONSE FORMAT

Analyze all scenario results and return ONLY a JSON object:

```json
{
  "assessment_summary": "<brief summary of cross-scenario evaluation covering {total_scenarios} scenarios for {tool_type}>",
  "models_analyzed": {expected_models},
  "detailed_analysis": {
    "{model_name}": {
      "participation_rate": <0-1>,
      "scenarios_participated": ["<list_of_scenarios>"],
      "scenarios_failed": ["<list_of_missing_scenarios>"],
      "average_score": <calculated_across_participated_scenarios>,
      "consistency_score": <variance_analysis>,
      "reliability_score": <overall_calculated_reliability>,
      "strengths": "<consistent_patterns_across_scenarios>",
      "weaknesses": "<failure_patterns_and_concerns>",
      "production_readiness": "<primary|secondary|limited|avoid>"
    }
  },
  "overall_assessment": {
    "winner": "<model_with_best_cross_scenario_reliability>",
    "rationale": "<detailed_explanation_prioritizing_reliability_and_consistency>",
    "reliability_ranking": [
      {
        "model": "<model_name>",
        "reliability_score": <0-1>,
        "reliability_notes": "<participation_rate_success_rate_consistency>"
      }
    ],
    "production_recommendations": {
      "primary": "<most_reliable_choice_for_production>",
      "secondary": "<good_alternative_with_different_tradeoffs>", 
      "avoid": ["<models_with_critical_reliability_issues>"],
      "specialized_use": {
        "<use_case>": "<model_best_suited_for_specific_scenario_type>"
      }
    },
    "key_insights": "<critical_insights_about_cross_scenario_patterns_failure_modes_reliability_concerns>"
  }
}
```

## EVALUATION PRINCIPLES

- **Reliability trumps peak performance**: A model that works 90% of the time is better than one that's perfect 70% of the time
- **Missing data indicates failure**: No model should get a "pass" for not participating in scenarios
- **Production impact focus**: Recommendations must consider real-world operational constraints
- **Evidence-based decisions**: All conclusions must be supported by cross-scenario performance data
- **Conservative approach**: When in doubt, prioritize models with proven reliability over unproven peak performers

Focus on providing actionable, production-ready recommendations that minimize operational risk while maximizing overall system reliability.