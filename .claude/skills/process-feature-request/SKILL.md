---
name: process-feature-request
description: Process a feature request or response from another dot-ai project. Reads from tmp directory, implements/integrates, and writes response if needed.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Process Feature Request/Response

Read and process a feature request or response from another dot-ai project.

## Process

1. Check for `tmp/feature-request.md` (incoming request from another project)
2. If not found, check for `tmp/feature-response.md` (response to a request we made)
3. If neither exists, tell the user there's nothing pending

### For Incoming Request (feature-request.md)
1. Present the request to the user and confirm they want to proceed
2. Implement the requested feature
3. Write a response file to the requesting project (path specified in the request)
4. **Delete the feature-request.md file** after implementation is complete

### For Response (feature-response.md)
1. Read and present the response
2. Use the information to continue integrating the feature
3. **Delete the feature-response.md file** after integration is complete

## Response File Format (for incoming requests only)

```markdown
# Feature Response from [THIS_PROJECT]

## What Was Implemented

[Brief description of what was built]

## How to Use It

[API signatures, endpoints, types, parameters]

## Examples

[Code examples showing how to call/use the feature]

## Notes

[Any caveats, limitations, or additional context]
```

## Guidelines

1. Read and understand the full request/response before proceeding
2. For requests: use your judgment on the best approach
3. Write clear documentation in responses so the requesting project can integrate easily
