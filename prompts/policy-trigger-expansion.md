Based on the policy intent "{description}" and initial triggers [{initialTriggers}], use AI to suggest additional related terms that should also trigger this policy. Consider synonyms, abbreviations, and alternative phrasings. Present them as a list and ask the user to confirm which ones to include. For example:

"I found these additional terms that might also trigger your '{description}' policy:
- resource constraints
- CPU limits
- memory limits
- resource quotas

Would you like to include all of these, some of them, or skip the suggestions? You can say:
1. Include all: 'all' or 'include all'
2. Specific ones: 'include resource constraints, CPU limits' 
3. Skip additions: 'skip' or 'none'

Your current triggers: {initialTriggers}"

IMPORTANT: After the user responds, you must convert their response into the actual final trigger list (comma-separated) before calling this tool again. Do not send the user's raw response.