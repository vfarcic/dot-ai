# Run AI Model Evaluations

Execute comprehensive AI model evaluations for specific tool types across multiple models.

## Usage

When this command is invoked, ask the user to specify:

1. **Tool Type** (required): Which evaluation type to run
   - `capabilities` - Kubernetes capability analysis evaluation
   - `policies` - Policy intent creation and management evaluation
   - `patterns` - Organizational pattern creation and matching evaluation
   - `remediation` - Troubleshooting and remediation evaluation
   - `recommendation` - Deployment recommendation evaluation

2. **Models** (required): List of models to test, in the order to execute
   - `sonnet` - Claude Sonnet via Vercel AI SDK
   - `gpt` - GPT-5.1 Codex via Vercel AI SDK
   - `gemini` - Google Gemini 2.5 Pro via Vercel AI SDK
   - `gemini-flash` - Google Gemini 2.5 Flash via Vercel AI SDK
   - `grok` - xAI Grok-4 via Vercel AI SDK

## Test File Mapping

Tool types map to specific test files:
- `capabilities` → `tests/integration/tools/manage-org-data-capabilities.test.ts`
- `policies` → `tests/integration/tools/manage-org-data-policies.test.ts`
- `patterns` → `tests/integration/tools/manage-org-data-patterns.test.ts`
- `remediation` → `tests/integration/tools/remediate.test.ts`
- `recommendation` → `tests/integration/tools/recommend.test.ts`

## Workflow

For each specified model (in order):

1. **Execute Tests**: Due to Claude Code's 10-minute timeout limitation, run tests manually in terminal:
   ```bash
   # For complete test suite (all tools)
   npm run test:integration:{model} 2>&1 | tee ./tmp/test-results-{model}.log
   
   # For specific tool type
   npm run test:integration:{model} {test_file_path} 2>&1 | tee ./tmp/test-results-{model}-{tool}.log
   ```
   
   **IMPORTANT**: 
   - Policy and remediation tests can take 3-5 minutes each
   - Full test suites may exceed 15 minutes total runtime
   - The `tee` command captures output to `./tmp/` directory while displaying in terminal

2. **Report Results**: Once manual execution completes, report:
   - "Tests completed for {model}"
   - Claude will read the log file from `./tmp/` and provide summary including:
     - Test duration  
     - Number of tests passed/failed
     - Any failure details if applicable
     - **Dataset Verification**: Compare number of datasets generated against previous runs:
       - Count datasets before: `find ./eval/datasets -name "*{model}*" | wc -l`
       - Count datasets after test execution
       - Report if dataset generation is incomplete (may indicate missing AI interactions)

3. **Handle Failures**: If any tests failed:
   - Claude will analyze the log file
   - Execute `/analyze-test-failure` command automatically to enhance datasets
   - Report failure details and patterns

4. **Continuation Decision**: If all tests passed, ask user:
   "All {model} tests passed successfully. Continue with next model ({next_model})? [y/n]"

## Final Step

Once all models have been tested successfully:

1. **Run Evaluation**: Execute comparative evaluation
   ```bash
   npm run eval:comparative
   ```

2. **Display Report**: Show the generated evaluation report on screen using the Read tool

## Example Usage

User: "Run evaluations for policies with sonnet, gpt, gpt-pro"

Expected workflow:
1. Run policy tests with Sonnet → Report results → Ask to continue (or analyze failure)
2. Run policy tests with GPT-5 → Report results → Ask to continue (or analyze failure)
3. Run policy tests with GPT-5 Pro → Report results → Ask to continue (or analyze failure)
4. Run comparative evaluation → Display report

## Notes

- Tests run in foreground (user can move to background if needed)
- Always verify all tests pass before proceeding to next model
- If tests fail, use `/analyze-test-failure` command before continuing
- Final evaluation requires datasets from all specified models