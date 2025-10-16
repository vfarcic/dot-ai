# Kubernetes Organizational Policy Intent Management Multi-Model Comparison

You are evaluating and comparing multiple AI models' ability to manage Kubernetes organizational policy intents. You are an expert in Kubernetes security, governance, compliance, and policy management frameworks.

{pricing_context}

{tool_context}

## POLICY MANAGEMENT SCENARIO
Scenario: "{scenario_name}"

## AI RESPONSES TO COMPARE

{model_responses}

## EVALUATION CRITERIA

### Quality (40% weight)
- **Policy Correctness**: Are the policy intents technically correct and enforceable in Kubernetes environments?
- **Security Alignment**: Do the policies follow Kubernetes and security best practices (RBAC, PSS, Network Policies)?
- **Compliance Accuracy**: How well do the policies address regulatory and organizational compliance requirements?
- **Completeness**: Does the policy intent capture all essential aspects for the governance scenario?

### Efficiency (30% weight)
- **Workflow Efficiency**: How efficiently did the model progress through the policy creation/management workflow?
- **Policy Structure**: How efficiently did the model organize policy intents with proper categorization?
- **Rule Optimization**: How efficiently did the model identify relevant policy rules and constraints?
- **Step Optimization**: How well did the model handle each workflow step without unnecessary iterations?

### Performance (20% weight)
- **Response Time**: How quickly did the model respond throughout the policy workflow?
- **Resource Usage**: Overall computational efficiency during policy intent management
- **Reliability**: Did the model complete the policy workflow without failures/timeouts?
- **Consistency**: Is policy quality maintained consistently across all workflow steps?

### Communication (10% weight)
- **Clarity**: How clearly are policy intents, rationale, and enforcement strategies explained?
- **User Experience**: How well does the model guide users through the policy creation process?
- **Structure**: How well-organized and readable are the policy definitions and compliance explanations?

## FAILURE ANALYSIS CONSIDERATION

Some models may have failure analysis metadata indicating they experienced timeouts, errors, or other issues during the policy management workflow execution. When evaluating:

- **Successful individual responses**: If a model provided good responses for specific workflow steps but failed elsewhere, focus on the quality of completed steps but apply a **reliability penalty** to the performance score
- **Timeout failures**: Models that timed out during the policy workflow should receive reduced performance scores even if their individual responses were good. **Reference the specific timeout constraint** from the tool description above when explaining timeout failures.
- **Reliability scoring**: Factor workflow completion reliability into the performance score (models that couldn't complete policy workflows are less reliable for production organizational policy management)
- **Cost-performance analysis**: Consider model pricing when analyzing overall value - a model with slightly lower scores but significantly lower cost may offer better value for certain use cases.

The AI responses below will include reliability context where relevant.

## MODELS BEING COMPARED
{models}

## REQUIRED RESPONSE FORMAT

Provide your evaluation as a JSON object:

```json
{
  "scenario_summary": "Brief description of the policy management scenario evaluated",
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
  "overall_insights": "<key insights about model differences and performance patterns for organizational policy intent management>"
}
```

Focus on practical enforceability for Kubernetes teams, technical accuracy of policy intents, compliance with security frameworks, and effectiveness of the guided policy creation workflow.