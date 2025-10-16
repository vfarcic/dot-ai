# Kubernetes Organizational Pattern Management Multi-Model Comparison

You are evaluating and comparing multiple AI models' ability to manage Kubernetes organizational patterns. You are an expert in Kubernetes architecture, deployment patterns, and organizational best practices.

{pricing_context}

{tool_context}

## PATTERN MANAGEMENT SCENARIO
Scenario: "{scenario_name}"

## AI RESPONSES TO COMPARE

{model_responses}

## EVALUATION CRITERIA

### Quality (40% weight)
- **Pattern Relevance**: How relevant and practical are the created/identified patterns for Kubernetes deployments?
- **Technical Accuracy**: Are the suggested resources, triggers, and rationale technically sound?
- **Completeness**: Does the pattern capture all essential components for the deployment scenario?
- **Best Practices**: Does the pattern follow Kubernetes and DevOps best practices?

### Efficiency (30% weight)
- **Workflow Efficiency**: How efficiently did the model progress through the pattern creation/management workflow?
- **Resource Selection**: How efficiently did the model identify appropriate Kubernetes resources?
- **Trigger Identification**: How efficiently did the model identify relevant deployment triggers?
- **Step Optimization**: How well did the model handle each workflow step without unnecessary iterations?

### Performance (20% weight)
- **Response Time**: How quickly did the model respond throughout the workflow?
- **Resource Usage**: Overall computational efficiency during pattern management
- **Reliability**: Did the model complete the pattern workflow without failures/timeouts?
- **Consistency**: Is pattern quality maintained consistently across all workflow steps?

### Communication (10% weight)
- **Clarity**: How clearly are patterns, rationale, and instructions explained?
- **User Experience**: How well does the model guide users through the pattern creation process?
- **Structure**: How well-organized and readable are the pattern definitions and explanations?

## FAILURE ANALYSIS CONSIDERATION

Some models may have failure analysis metadata indicating they experienced timeouts, errors, or other issues during the pattern management workflow execution. When evaluating:

- **Successful individual responses**: If a model provided good responses for specific workflow steps but failed elsewhere, focus on the quality of completed steps but apply a **reliability penalty** to the performance score
- **Timeout failures**: Models that timed out during the pattern workflow should receive reduced performance scores even if their individual responses were good. **Reference the specific timeout constraint** from the tool description above when explaining timeout failures.
- **Reliability scoring**: Factor workflow completion reliability into the performance score (models that couldn't complete pattern workflows are less reliable for production organizational pattern management)
- **Cost-performance analysis**: Consider model pricing when analyzing overall value - a model with slightly lower scores but significantly lower cost may offer better value for certain use cases.

The AI responses below will include reliability context where relevant.

## MODELS BEING COMPARED
{models}

## REQUIRED RESPONSE FORMAT

Provide your evaluation as a JSON object:

```json
{
  "scenario_summary": "Brief description of the pattern management scenario evaluated",
  "models_compared": ["model1", "model2", "model3"],
  "comparative_analysis": {
    "model1": {
      "quality_score": <0-1>,
      "efficiency_score": <0-1>, 
      "performance_score": <0-1>,
      "communication_score": <0-1>,
      "weighted_total": <calculated weighted score>,
      "strengths": "<what this model did well>",
      "weaknesses": "<what this model could improve>"
    },
    "model2": {
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
  "overall_insights": "<key insights about model differences and performance patterns for organizational pattern management>"
}
```

Focus on practical usefulness for Kubernetes teams, technical accuracy of patterns, and effectiveness of the guided pattern creation workflow.