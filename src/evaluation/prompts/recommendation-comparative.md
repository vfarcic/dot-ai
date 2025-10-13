# Kubernetes Deployment Recommendation Multi-Model Comparison

You are evaluating and comparing multiple AI models' responses to the same Kubernetes deployment recommendation scenario. You are an expert in Kubernetes operations, deployment patterns, and DevOps best practices.

## RECOMMENDATION SCENARIO
User Issue: "{issue}"

## WORKFLOW PHASES
The recommendation system has 4 phases:
- **clarification_phase**: Intent analysis and identifying missing context/requirements
- **question_generation**: Generating specific questions to enhance deployment specifications  
- **solution_assembly**: Selecting appropriate Kubernetes resources and deployment patterns
- **generate_manifests_phase**: Generating production-ready Kubernetes YAML manifests

**Current Phase Being Evaluated: "{phase}"**

## AI RESPONSES TO COMPARE

{model_responses}

## EVALUATION CRITERIA

### Quality (40% weight)
- **Solution Appropriateness**: Are the recommendations appropriate for the user's requirements and context?
- **Technical Accuracy**: Are the Kubernetes resources, configurations, and patterns technically correct?
- **Completeness**: Does the response address all aspects needed for a production deployment?
- **Best Practices**: Does the response follow Kubernetes and DevOps best practices?

### Efficiency (30% weight)  
- **Token Usage**: How efficiently did the model use tokens relative to output quality?
- **Response Conciseness**: How efficiently did the model communicate the solution?
- **Resource Selection**: How efficiently did the model select the most appropriate resources without over-engineering?

### Performance (20% weight)
- **Response Time**: How quickly did the model respond?
- **Iteration Count**: How many processing iterations were needed?
- **Resource Usage**: Overall computational efficiency
- **Reliability**: Did the model complete the full workflow without failures/timeouts?

### Communication (10% weight)
- **Clarity**: How clearly are the recommendations and rationale explained?
- **Structure**: How well-organized and readable is the response?
- **Actionability**: How easy is it for a user to understand and implement the recommendations?

## PHASE-SPECIFIC EVALUATION FOCUS

### For clarification_phase:
- How well does the model identify missing context and requirements?
- Quality of clarifying questions to enhance the deployment specification
- Understanding of Kubernetes deployment patterns and operational considerations

### For question_generation:
- Relevance and specificity of generated questions
- Coverage of operational, security, and scaling concerns
- Alignment with Kubernetes best practices

### For solution_assembly:
- Appropriateness of selected Kubernetes resources and operators
- Quality of deployment pattern recommendations
- Consideration of production requirements (HA, scaling, monitoring)

### For generate_manifests_phase:
- Technical correctness of generated Kubernetes manifests
- Production-readiness (security, resource limits, probes, etc.)
- Adherence to YAML best practices and Kubernetes conventions

## FAILURE ANALYSIS CONSIDERATION

Some models may have failure analysis metadata indicating they experienced timeouts, errors, or other issues during the full workflow execution. When evaluating:

- **Successful individual responses**: If a model provided a good response for this specific phase but failed elsewhere in the workflow, focus on the quality of THIS response but apply a **reliability penalty** to the performance score
- **Timeout failures**: Models that timed out during the full workflow should receive reduced performance scores even if their individual responses were good
- **Reliability scoring**: Factor workflow completion reliability into the performance score (models that couldn't complete the full workflow are less reliable for production use)

The AI responses below will include reliability context where relevant.

## RESPONSE FORMAT

Analyze all AI responses against these weighted criteria and return ONLY a JSON object:

```json
{
  "scenario_summary": "<brief summary of the recommendation scenario and phase>",
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
  "overall_insights": "<key insights about model differences and performance patterns for this recommendation phase>"
}
```