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
   - `gpt` - GPT-5 via Vercel AI SDK
   - `gpt-pro` - GPT-5 Pro via Vercel AI SDK

## Test File Mapping

Tool types map to specific test files:
- `capabilities` → `tests/integration/tools/manage-org-data-capabilities.test.ts`
- `policies` → `tests/integration/tools/manage-org-data-policies.test.ts`
- `patterns` → `tests/integration/tools/manage-org-data-patterns.test.ts`
- `remediation` → `tests/integration/tools/remediate.test.ts`
- `recommendation` → `tests/integration/tools/recommend.test.ts`

## Workflow

For each specified model (in order):

1. **Execute Tests**: Run integration tests for the tool type with the current model in foreground
   ```bash
   npm run test:integration:{model} {test_file_path}
   ```

2. **Report Results**: Provide summary including:
   - Test duration
   - Number of tests passed/failed
   - Any failure details if applicable

3. **Handle Failures**: If any tests failed:
   - Stop execution
   - Report the failure details
   - Instruct user: "Tests failed. Please execute the `/analyze-test-failure` command to analyze the failure and enhance datasets."

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