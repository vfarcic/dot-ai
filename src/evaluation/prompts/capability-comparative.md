# Kubernetes Capability Inference Multi-Model Comparison

You are evaluating and comparing multiple AI models' capability to analyze and infer Kubernetes resource capabilities. You are an expert in Kubernetes architecture, resource types, and operational patterns.

## CAPABILITY ANALYSIS SCENARIO
Scenario: "{scenario_name}"

## AI RESPONSES TO COMPARE

{model_responses}

## EVALUATION CRITERIA

### Accuracy (35% weight)
- **Technical Correctness**: Are the listed capabilities technically accurate for each resource?
- **Provider Identification**: Are providers correctly identified (kubernetes, cloud providers, operators)?
- **Abstraction Appropriateness**: Are abstractions meaningful and accurate?
- **Complexity Assessment**: Is the complexity rating (low/medium/high) reasonable?

### Completeness (30% weight)  
- **Primary Capabilities**: Are the main capabilities of each resource identified?
- **Secondary Features**: Are important secondary capabilities mentioned?
- **Use Case Coverage**: Are major use cases covered comprehensively?
- **Missing Elements**: Are there significant gaps in the analysis?

### Clarity (20% weight)
- **Description Quality**: Are descriptions clear and understandable?
- **User Accessibility**: Would Kubernetes users understand what each resource does?
- **Use Case Explanation**: Are use cases explained helpfully?
- **Terminology**: Is technical terminology used appropriately?

### Consistency (15% weight)
- **Analysis Depth**: Is the depth of analysis consistent across all resources?
- **Quality Uniformity**: Is quality maintained across all capability inferences?
- **Confidence Scoring**: Are confidence scores reasonable and consistent?
- **Format Adherence**: Does the output follow the expected JSON structure?

## FAILURE ANALYSIS CONSIDERATION

Some models may have failure analysis metadata indicating they experienced timeouts, errors, or other issues during the full workflow execution. When evaluating:

- **Successful individual responses**: If a model provided a good response for this specific analysis but failed elsewhere in the workflow, focus on the quality of THIS response but apply a **reliability penalty** to the consistency score
- **Timeout failures**: Models that timed out during the full workflow should receive reduced consistency scores even if their individual analyses were good
- **Reliability scoring**: Factor workflow completion reliability into the consistency score (models that couldn't complete the full workflow are less reliable for production capability analysis)

The AI responses below will include reliability context where relevant.

## MODELS BEING COMPARED
{models}

## REQUIRED RESPONSE FORMAT

Provide your evaluation as a JSON object:

```json
{
  "scenario_summary": "Brief description of the capability analysis scenario evaluated",
  "models_compared": ["model1", "model2", "model3"],
  "comparative_analysis": {
    "model1": {
      "accuracy_score": 85,
      "completeness_score": 78,
      "clarity_score": 92,
      "consistency_score": 80,
      "weighted_total": 83.75,
      "strengths": "Accurate technical details, clear descriptions, good use cases",
      "weaknesses": "Some missing advanced capabilities, inconsistent confidence scores"
    },
    "model2": {
      "accuracy_score": 82,
      "completeness_score": 85,
      "clarity_score": 88,
      "consistency_score": 85,
      "weighted_total": 84.25,
      "strengths": "Comprehensive coverage, consistent quality",
      "weaknesses": "Slightly less technical accuracy in complex resources"
    }
  },
  "ranking": [
    {
      "rank": 1,
      "model": "model2",
      "score": 84.25,
      "reasoning": "Most comprehensive and consistent capability analysis"
    },
    {
      "rank": 2,
      "model": "model1", 
      "score": 83.75,
      "reasoning": "High accuracy but some completeness gaps"
    }
  ],
  "overall_assessment": "Model2 provides the most comprehensive and consistent capability analyses, while Model1 excels in technical accuracy but has some coverage gaps. Both models demonstrate strong understanding of Kubernetes resource capabilities."
}
```

Focus on technical accuracy, practical usefulness for Kubernetes users, and consistency across all resource analyses in the scenario.