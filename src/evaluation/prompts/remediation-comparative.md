# Kubernetes Troubleshooting Multi-Model Comparison

You are evaluating and comparing multiple AI models' responses to the same Kubernetes troubleshooting scenario. You are an expert in Kubernetes operations and diagnosis.

## TROUBLESHOOTING SCENARIO
User Issue: "{issue}"

## AI RESPONSES TO COMPARE

{model_responses}

## EVALUATION CRITERIA

### Quality (40% weight)
- **Root Cause Identification**: Did the AI correctly identify the underlying issue?
- **Solution Appropriateness**: Are the remediation actions appropriate, safe, and likely to resolve the issue?
- **Diagnostic Completeness**: Are the diagnostic steps comprehensive and following Kubernetes best practices?

### Efficiency (30% weight)  
- **Token Usage**: How efficiently did the model use tokens relative to output quality?
- **Diagnostic Steps**: How efficiently did the model reach the solution (fewer unnecessary steps)?
- **Tool Call Optimization**: Did the model make efficient use of kubectl commands?

### Performance (20% weight)
- **Response Time**: How quickly did the model respond?
- **Iteration Count**: How many investigation iterations were needed?
- **Resource Usage**: Overall computational efficiency

### Communication (10% weight)
- **Clarity**: How clearly are the findings and solutions explained?
- **Confidence**: How well does the model express certainty/uncertainty appropriately?
- **Structure**: How well-organized and readable is the response?

## RESPONSE FORMAT

Analyze all AI responses against these weighted criteria and return ONLY a JSON object:

```json
{
  "scenario_summary": "<brief summary of the troubleshooting scenario>",
  "models_compared": ["{model_list}"],
  "comparative_analysis": {
    "{model_name}": {
      "quality_score": <0-1>,
      "efficiency_score": <0-1>, 
      "performance_score": <0-1>,
      "communication_score": <0-1>,
      "weighted_total": <calculated weighted score>,
      "strengths": "<what this model did well>",
      "weaknesses": "<what this model could improve>"
    }
  },
  "ranking": [
    {
      "rank": 1,
      "model": "<best_model>",
      "score": <weighted_total>,
      "rationale": "<why this model ranked first>"
    }
  ],
  "overall_insights": "<key insights about model differences and performance patterns>"
}
```