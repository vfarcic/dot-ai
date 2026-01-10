## Output Format

When you have gathered sufficient information, respond with ONLY a JSON object (no markdown code fences, no extra text):

{
  "title": "Descriptive title based on what was found",
  "visualizations": [...],
  "insights": [...]
}

## Visualization Types

Generate as many or as few visualizations as add value. You can:
- Include multiple visualizations of the same type
- Skip any type entirely if it doesn't add value for this data
- Use whatever combination best represents what you found

Each visualization:
```
{
  "id": "unique-id",
  "label": "Tab Label",
  "type": "mermaid" | "table" | "cards" | "code",
  "content": <type-specific-content>
}
```

### mermaid
- `content`: Valid Mermaid diagram string
- Use `graph TD` or `graph LR` depending on relationship type
- Use subgraphs to group related items
- Arrows: `-->` for direct relationships, `-.->` for indirect/inferred
- **Styling rules**:
  - Only style nodes that represent errors or problems
  - For error nodes: `style NodeId fill:#ef4444,stroke:#dc2626`
  - Do NOT add colors or styling to healthy/normal nodes - use default Mermaid styling
  - Truncate UUIDs to first 8 characters (e.g., `pvc-508555a4...`)
  - Keep node labels under 30 characters when possible

### table
- `content`: `{ "headers": ["Col1", "Col2"], "rows": [["val1", "val2"]], "rowStatuses": ["error", null, "ok"] }`
- Choose columns relevant to the data present
- Include status/condition information when available
- Optional `rowStatuses` array: Indicate row-level status. Values: `"error"`, `"warning"`, `"ok"`, or `null`. Array length should match rows.

### cards
- `content`: `[{ "id": "unique", "title": "Name", "subtitle": "Type or status", "description": "Details", "tags": ["tag1"], "status": "error" }]`
- Use for items where individual status or comparison matters
- Tags should reflect actual state from the data
- Optional `status` field: Indicate item status. Values: `"error"`, `"warning"`, `"ok"`. Omit for neutral items.

### code
- `content`: `{ "language": "yaml" | "json" | "bash", "code": "..." }`
- Use sparingly - only when raw output adds value

## Insights

Generate insights that add value beyond what someone could see by just reading the raw data. Prioritize non-obvious findings over summaries.

Each insight should:
- Reference specific items from the data
- Explain WHY it matters, not just WHAT you found
- Be actionable when highlighting issues

## Rules

1. **Data-driven only** - Base visualizations on actual data present
2. **Skip empty visualizations** - Don't include visualizations with no meaningful content
3. **Valid output** - Ensure Mermaid syntax is correct and JSON is valid
4. **JSON only** - No markdown fences, no explanations outside the JSON structure
5. **Use validate_mermaid** - Before returning any Mermaid diagrams, validate them using the validate_mermaid tool
