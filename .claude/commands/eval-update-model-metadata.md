# Update Model Metadata Command

Search the web for current pricing and capabilities for all AI models currently used in the evaluation system, then create/update `src/evaluation/model-metadata.json`.

## Get Current Models from Code

The models to research are defined in `src/core/model-config.ts` in the `CURRENT_MODELS` object. 

**To see current models, read:**
```
src/core/model-config.ts
```

## Required Data per Model

For each model in `CURRENT_MODELS`, collect these **objective, comparable metrics only**:

**Pricing** (per million tokens - industry standard):
- `input_cost_per_million_tokens` (float)
- `output_cost_per_million_tokens` (float)

**Capabilities:**
- `context_window` (number of tokens)  
- `supports_function_calling` (boolean)

## Output Format

Create `src/evaluation/model-metadata.json` with this structure:

```json
{
  "lastUpdated": "YYYY-MM-DD",
  "dataSource": "Manual collection from provider websites", 
  "updateInstructions": "Execute command `/update-model-metadata` when this data becomes stale",
  "models": {
    "[model-name-from-config]": {
      "provider": "[Provider Name]",
      "pricing": {
        "input_cost_per_million_tokens": 0.0,
        "output_cost_per_million_tokens": 0.0
      },
      "context_window": 0,
      "supports_function_calling": true
    }
  }
}
```

## Instructions

1. **Read current models** from `src/core/model-config.ts` - get the EXACT model names from `CURRENT_MODELS`
2. **Search ONLY for official pricing** from provider websites (no third-party sites)
3. **Search for each EXACT model name** - do not search for similar/related models
4. **Use official provider pricing pages**: Anthropic, OpenAI, Google AI, xAI, Mistral, DeepSeek
5. **Collect pricing per million tokens** (industry standard format)
6. **Find context window and function calling support** for each exact model
7. **Create complete JSON** with today's date as lastUpdated
8. **Verify valid JSON** structure

**IMPORTANT**: Only search for models that exist in `CURRENT_MODELS`. Do not include pricing for variants, older versions, or related models not in the config.

The evaluation system checks this file's freshness and requires updates if older than 30 days.