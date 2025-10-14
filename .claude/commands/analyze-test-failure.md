# Analyze Test Failure

When an integration test fails, analyze the failure and enhance the related dataset with failure insights for comprehensive evaluation.

## Instructions

**CRITICAL**: This analysis must distinguish between AI capability failures vs integration/formatting failures. Don't assume all test failures indicate poor AI performance.

Analyze the test failure by following these steps in order:

### Step 1: Identify All Test Failures
- Extract all failed tests from test logs
- Note the specific failure reasons (timeout, assertion errors, infrastructure issues)
- Record test duration and failure timestamps

### Step 2: Find Related Datasets and Debug Files
- Look in `eval/datasets/` for datasets matching each failed test
- Match by timestamp, test scenario, and tool name
- **CRITICAL**: Check if datasets already have `failure_analysis` populated
- **VERIFY**: Use `grep -l "API error\|timeout\|Error:"` to find datasets with failures
- **COUNT**: Compare dataset counts before/after test failures to identify missing datasets

#### Debug File Analysis (PRIORITY - Start Here)
- **Check debug files FIRST**: Look in `./tmp/debug-ai/` for detailed AI interaction logs
- **Match timestamps**: Correlate debug files with failed test timestamps  
- **Extract context**: Review actual prompts, responses, and error details from debug files
- **Understand root cause**: Use debug files to determine exact failure reasons beyond test assertions
- **CRITICAL**: Look for patterns like `result.text: [EMPTY]`, incomplete steps, or missing final responses

### Step 3: Process Each Failed Test

For each test failure, determine the appropriate action:

#### Case A: Dataset Exists with Correct failure_analysis
- **Action**: Skip - already properly documented
- **Check**: Verify failure_analysis matches the actual test failure

#### Case B: Dataset Exists with Empty/Missing failure_analysis  
- **Action**: Add failure_analysis to existing dataset
- **Reason**: AI succeeded but test failed due to infrastructure/validation issues
- **Example**: AI provided good analysis but test expected infrastructure changes that didn't occur

#### Case C: No Dataset Generated (HTTP/Test-Level Timeouts)
- **Action**: Create synthetic dataset manually **ONLY IF NO RELATED DATASET EXISTS**
- **Reason**: Test client timed out before AI processing could generate dataset
- **Identify**: HTTP timeouts, test infrastructure failures that prevented AI interaction
- **VERIFY FIRST**: Confirm no existing datasets match this failure scenario
- **Create**: Use format below with appropriate timestamps

#### Case D: Dataset Exists but Doesn't Represent the Timeout
- **Action**: Create synthetic dataset for the actual timeout failure
- **Reason**: Existing datasets show successful AI interactions, timeout occurred later
- **Key Check**: If dataset output contains valid AI response (not timeout error), then timeout happened in subsequent operation
- **Example**: Recommendation test has successful manifest generation datasets, but test timed out during deployment phase
- **Logic**: Successful dataset + test timeout = timeout occurred after dataset creation

#### **CRITICAL DECISION POINT**: Before Creating ANY Synthetic Dataset

**STOP and ask these questions:**

1. **Is there already comprehensive dataset coverage?** 
   - Count existing datasets: `find ./eval/datasets -name "*[model]*" | wc -l`
   - If 50+ datasets exist, the evaluation already has substantial data

2. **Will synthetic datasets improve evaluation quality?**
   - Timeout datasets show infrastructure failures, not AI capability failures
   - Consider if the test failure adds meaningful evaluation data

3. **Is the failure representative of real-world scenarios?**
   - Test infrastructure timeouts may not reflect actual AI usage patterns
   - Focus on AI response quality failures over test environment issues

**DEFAULT RECOMMENDATION**: With 106 existing Gemini Flash datasets providing comprehensive coverage, synthetic failure datasets are likely unnecessary unless they represent critical AI capability gaps.

### Step 4: Deep Root Cause Analysis (MANDATORY - Don't Skip This)

**CRITICAL**: Before categorizing failure type, perform comprehensive analysis:

#### 4.1: Compare Expected vs Actual Response Structure
1. **Read the test file** to understand what response structure was expected
2. **Examine debug files** to see what the AI actually generated
3. **Identify the mismatch**: Was it capability failure or response formatting failure?

**Key Questions to Answer:**
- Did the AI perform the intended analysis/generation correctly?
- Did the AI provide the expected structured response format?
- Was the test failure due to AI incapability or integration/formatting issues?

#### 4.2: Analyze AI Performance vs Integration Failure
**Response Completion Analysis:**
- Check if debug files show `result.text: [EMPTY]` or incomplete responses
- Look for multi-step reasoning that succeeded but lacked final structured output
- Verify if AI generated correct content but in wrong format for test validation

**Expected Response Format Analysis:**
- Look at test assertions to understand what JSON/structure was expected
- Check if AI provided analysis but not in the required format (e.g., missing JSON wrapper)
- Identify if parsing functions failed due to missing structured response

#### 4.3: Categorize Failure Types (Using Debug Files + Test Logs)
- **Response Formatting Failure**: AI performed correctly but didn't provide expected structured response
  - Debug shows good reasoning but `result.text: [EMPTY]` or incomplete final response
  - AI generated valid content but test expected specific JSON/API response format
- **Capability Failure**: AI couldn't perform the requested analysis/generation
  - Debug shows poor reasoning, incorrect analysis, or invalid outputs
- **Context Length/Token Limits**: AI reasoning cut off mid-process
  - Debug shows truncated responses or incomplete multi-step processing
- **API/Infrastructure**: Network, parsing, or system-level failures  
  - Debug shows connection errors, API rate limits, or parsing exceptions
- **Test Infrastructure**: Cluster/validation issues unrelated to AI performance
  - Debug shows kubectl failures or environment issues

### Step 5: Update/Create Datasets

#### For Existing Datasets (Case B):
Add `failure_analysis` to metadata section:
```json
{
  "failure_analysis": {
    "failure_type": "timeout|error|infrastructure",
    "failure_reason": "Factual description of what happened",
    "time_to_failure": "Duration before failure in ms"
  }
}
```

#### For Missing Datasets (Case C):

**CRITICAL**: Use correct filename patterns for evaluation inclusion:

**Filename Format**: `{tool}_{dynamic_interaction_id}_{sdk}_{model}_{timestamp}.jsonl`

**IMPORTANT**: Do NOT create synthetic datasets with arbitrary names. Instead:

1. **FIRST**: Check existing datasets to see the EXACT patterns being used:
   ```bash
   find ./eval/datasets -name "*[model]*" | head -5
   ```

2. **Copy existing patterns**: Use the same interaction IDs and prefixes as real datasets from the same test run:
   - `recommend_generate_manifests_phase_` - Manifest generation
   - `recommend_clarification_phase_` - Recommendation clarification  
   - `remediate_manual_analyze_` - Manual remediation analysis
   - `remediate_automatic_analyze_execute_` - Automatic remediation
   - `capability_auto_scan_` - Auto capability scanning
   - `capability_crud_auto_scan_` - CRUD operations on capabilities
   - `policy_triggers_step_` - Policy trigger step
   - `pattern_triggers_step_` - Pattern trigger step

3. **Match timestamp patterns**: Use same timestamp format as existing files: `2025-10-14_HHMMSSFFFZ`

4. **Verify against real files**: Before creating any synthetic dataset, check existing dataset filenames and use the EXACT same patterns

**Evaluation Loading Order**: Datasets are loaded in ascending chronological order (oldest to newest) based on filename timestamps.

Create new dataset file with this structure:
```json
{
  "input": {"issue": "Description of what was being attempted"},
  "output": "Request timeout - no response received within time limit",
  "performance": {
    "duration_ms": 1800000,
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0,
    "sdk": "vercel",
    "model_version": "model-name",
    "iterations": 0,
    "tool_calls_executed": 0,
    "cache_read_tokens": 0,
    "cache_creation_tokens": 0
  },
  "metadata": {
    "timestamp": "2025-XX-XXTXX:XX:XX.XXXZ",
    "complexity": "high",
    "tags": ["infrastructure", "timeout"],
    "source": "integration_test",
    "tool": "tool-name",
    "test_scenario": "test-scenario-name",
    "failure_analysis": {
      "failure_type": "timeout",
      "failure_reason": "HTTP request timeout after Xms during test operation",
      "time_to_failure": 1800000
    }
  }
}
```

### Step 6: Verification
- Confirm all test failures now have corresponding datasets with failure_analysis
- Verify failure_analysis accurately reflects what actually happened
- **IMPORTANT**: Check for duplicate datasets - remove any incorrectly created synthetic datasets
- Ensure evaluation AI will see complete picture of model performance
- **FINAL CHECK**: Only create synthetic datasets for true HTTP/test-level timeouts where NO datasets exist

## Practical Workflow

### Before Creating Any Datasets:
1. **Search for existing datasets**: `grep -l "Error\|timeout\|failed" eval/datasets/*[model]*[date]*.jsonl`
2. **Check failure_analysis status**: Look for `"failure_analysis":""` (empty) vs populated content
3. **Verify test scenario match**: Ensure dataset corresponds to the actual failed test
4. **Review debug files**: Check `./tmp/debug-ai/` for detailed error context and root cause analysis
5. **Cross-reference**: Correlate debug file timestamps with test failure timestamps

### Decision Tree:
- **Dataset exists + has failure_analysis** → ✅ Skip (already handled)
- **Dataset exists + empty failure_analysis + successful AI response** → ✅ Update existing dataset  
- **Dataset exists + successful AI response + test timeout** → ✅ Create synthetic dataset (timeout occurred after successful AI interaction)
- **No dataset exists + API error** → ❌ **ERROR** - datasets should exist for AI API errors
- **No dataset exists + HTTP timeout** → ✅ Create synthetic dataset (AI never responded)

### **CRITICAL**: Understanding When Datasets Are Created
- **Datasets are created INSIDE AI interactions** - when AI provider returns a response
- **If dataset contains valid AI output** → That AI interaction succeeded
- **If test fails with timeout** → Check if dataset output shows successful AI response:
  - **YES**: Timeout occurred after AI interaction, create synthetic dataset for timeout
  - **NO**: AI interaction failed, update existing dataset with failure analysis

### **Example: Distinguishing Successful AI vs Timeout**
```bash
# Test failed with: "Test timed out in 1200000ms"
# Found dataset: recommend_generate_manifests_phase_vercel_grok-4-fast-reasoning_2025-10-14_143913606Z.jsonl

# Check dataset output:
cat dataset.jsonl | grep -o '"output":"[^"]*"' | head -c 100
# Result: "output":"```yaml\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: postgres..."

# ANALYSIS: 
# ✅ Dataset shows successful AI response (generated Kubernetes manifests)
# ✅ Test timeout occurred AFTER this successful AI interaction
# 🔄 ACTION: Create synthetic dataset for the timeout that occurred later in test workflow
```

**vs**

```bash
# Test failed with: "Request timeout after 1800000ms" 
# Found dataset: capability_auto_scan_vercel_grok-4-fast-reasoning_2025-10-14_144108999Z.jsonl

# Check dataset output:
cat dataset.jsonl | grep -o '"output":"[^"]*"' | head -c 100
# Result: "output":"Request timeout - no response received within time limit"

# ANALYSIS:
# ❌ Dataset shows timeout error in AI response
# ❌ This dataset already represents the timeout failure
# 🔄 ACTION: Add failure_analysis to existing dataset, do NOT create synthetic dataset
```

### Common Mistakes to Avoid:
- ❌ Creating datasets when API error datasets already exist
- ❌ Not checking if failure_analysis is already populated  
- ❌ Creating multiple datasets for the same failure
- ❌ Not cleaning up incorrectly created synthetic datasets
- ❌ Not consulting debug files for accurate failure reasons
- ❌ Using generic error descriptions when debug files contain specific details
- ❌ **Using incorrect filename prefixes** - files won't be included in evaluations
- ❌ **Wrong tool prefixes** - use exact patterns: `capability_auto_scan_`, not `capability_full_auto_scan_timeout_`
- ❌ **Ignoring chronological order** - datasets load oldest to newest, affecting evaluation prompt order

## Debug File Usage Examples

### Example: Rate Limit Error Analysis
```bash
# Find debug files matching test timeframe
ls ./tmp/debug-ai/*mistral*2025-10-14*.txt

# Review specific debug file for detailed error context
cat ./tmp/debug-ai/debug-remediate-mistral-2025-10-14-003709.txt
# Contains: actual prompts, API responses, retry attempts, exact error messages
```

### Example: Context Length Error Analysis  
```bash
# Find debug files for policy failures
grep -l "too large\|context length" ./tmp/debug-ai/*.txt

# Extract exact token counts and prompt details
# Shows precisely what content caused the context overflow
```

### Using Debug Files to Enhance failure_analysis:
- **Response Completion Status**: Note `result.text: [EMPTY]` or incomplete final responses
- **AI Reasoning Quality**: Assess if multi-step reasoning was correct vs response formatting issues
- **Expected vs Actual Format**: Compare what AI generated vs what test assertions expected
- **Specific error messages**: Use exact API error text from debug files
- **Token counts**: Get precise numbers for context length failures
- **Request details**: Include actual parameters that caused failures
- **Retry patterns**: Document how many attempts were made before failure

### Analysis Depth Requirements:
**INSUFFICIENT**: "Test failed because AI response was incorrect"
**SUFFICIENT**: "AI performed correct 6-step investigation and identified OOMKilled pods with proper remediation plan, but failed to generate expected final JSON response format. Test expected structured API response but received empty result.text, indicating response completion/formatting failure rather than capability failure."

## Practical Analysis Workflow Example

### Example: Remediate Test Failure Analysis

**Step 1**: Test failed with `expected success: true, received success: false`

**Step 2**: Found debug file `remediate-investigation-raw_response.md` 

**Step 3**: Debug file shows:
- AI performed 6 investigation steps correctly
- Identified OOMKilled pods (128Mi limit vs 250M request)  
- Generated proper remediation commands
- BUT: `result.text: [EMPTY]` - no final response

**Step 4**: Read test file - expected JSON format:
```json
{
  "issueStatus": "active",
  "rootCause": "...",  
  "remediation": { "actions": [...] }
}
```

**Step 5**: Root cause analysis:
- **AI Capability**: ✅ Excellent (correct diagnosis, proper tool usage)
- **Response Formatting**: ❌ Failed (no final JSON provided)
- **Conclusion**: Response completion failure, NOT capability failure

**Step 6**: failure_analysis:
```json
{
  "failure_type": "error",
  "failure_reason": "Response completion failure - AI performed correct investigation but failed to generate expected final JSON response format"
}
```

## Important Notes

- **Document Facts Only**: Record objective data without interpretation
- **Preserve Evaluation Integrity**: Missing datasets can skew evaluation results
- **Handle Edge Cases**: HTTP timeouts, infrastructure failures, mixed success/failure scenarios
- **Timestamp Accuracy**: Use approximate timestamps based on test execution timeline
- **Debug File Priority**: When available, use debug files for more accurate failure reasons than test logs