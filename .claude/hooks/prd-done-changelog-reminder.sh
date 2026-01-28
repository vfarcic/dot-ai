#!/bin/bash
# Hook: Remind about changelog fragment when starting /prd-done workflow

# Read all of stdin (JSON may be multiline)
INPUT=$(cat)

# Check if prompt contains prd-done
if ! echo "$INPUT" | grep -q "prd-done"; then
  exit 0
fi

# For UserPromptSubmit, plain text stdout is added to Claude's context
echo "REMINDER: A changelog fragment may be needed for this PRD. Use /changelog-fragment if there are user-facing changes."
