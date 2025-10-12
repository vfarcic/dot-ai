# Analyze Test Failure

When an integration test fails, analyze the failure and enhance the related dataset with failure insights for comprehensive evaluation.

## Instructions

Analyze the test failure by:

1. **Find Related Dataset**: Look in `eval/datasets/` for the last dataset of the failing test type, matching timestamps from test logs
2. **Categorize Failure Type**: 
   - Timeout: Request exceeded time limit
   - Error: API/parsing/execution issues
   - Infrastructure: Cluster/network issues
3. **Update Dataset**: Add `failure_analysis` to dataset metadata with objective failure data
4. **Document Facts**: Record what happened without interpretation

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

Add this analysis to the dataset's metadata section for evaluators to assess.