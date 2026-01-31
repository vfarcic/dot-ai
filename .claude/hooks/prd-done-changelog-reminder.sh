#!/bin/bash
# Hook: Remind about changelog fragment when starting /prd-done workflow

# Read all of stdin (JSON may be multiline)
INPUT=$(cat)

# Check if prompt contains prd-done
if ! echo "$INPUT" | grep -q "prd-done"; then
  exit 0
fi

# For UserPromptSubmit, plain text stdout is added to Claude's context
echo "🛑 CHANGELOG CHECK: Run /changelog-fragment BEFORE any commits if there are user-facing changes."
