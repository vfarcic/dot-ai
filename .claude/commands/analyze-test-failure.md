# Analyze Test Failure

When an integration test fails, analyze the failure and enhance the related dataset with failure insights for comprehensive evaluation.

## Instructions

Analyze the test failure by:

1. **Find Related Dataset**: Look in `eval/datasets/` for datasets generated before the failure, matching timestamps from test logs
2. **Categorize Failure Type**: 
   - Timeout: Model too slow → Performance characteristic
   - Error: API/parsing issues → Reliability characteristic  
   - Infrastructure: Cluster/network → Not model-related
3. **Update Dataset**: Add `failure_analysis` to dataset metadata with failure type, duration, and evaluation insights
4. **Document Impact**: What this tells us about model suitability for different use cases

Generate failure analysis in this format (objective facts only):
```json
{
  "failure_analysis": {
    "failure_type": "timeout|error|infrastructure",
    "failure_reason": "Factual description of what happened",
    "time_to_failure": "Duration before failure in ms"
  }
}
```

Add this analysis to the dataset's metadata section and explain implications for comparative evaluation.