## AI provider errors no longer masked by JSON parse failures

When an AI provider call fails (e.g., proxy authentication error, network timeout), the actual error message is now surfaced to the user. Previously, the error string was passed directly to `JSON.parse()`, producing a confusing `SyntaxError: Unexpected token 'E', "Error duri"... is not valid JSON` that hid the real cause. This affected the query, remediate, impact-analysis tools, and the REST API visualization endpoint.
