# Can Help Tool - User Interaction Requirements

## 🤔 Check if DevOps AI Toolkit Can Help

Check if DevOps AI Toolkit can help with your deployment, application creation, or infrastructure request.

### ✅ WHEN TO USE THIS TOOL:
- User request is vague or unclear
- Uncertain if DevOps AI Toolkit is appropriate for the task
- Need to guide conversation toward specific requirements
- Want to check capabilities before proceeding

### 🎯 PURPOSE:
- Route vague requests to specific guidance
- Explain DevOps AI Toolkit's capabilities
- Guide users toward actionable descriptions
- Prevent inappropriate tool usage

### Input Requirements:

**📝 Request Parameter:**
- Simple description of what the user wants to do
- Can be generic or unclear (this tool handles that)
- Examples: "create an app", "deploy something", "setup infrastructure"

### Tool Response:
- **If DevOps AI Toolkit can help**: Provides guidance on next steps and recommends using the `recommend` tool with specific details
- **If uncertain fit**: Explains DevOps AI Toolkit's capabilities and suggests how to be more specific

### Example Workflow:
1. User says: "create an app"
2. Use `can_help` with request: "create an app" 
3. Tool responds with guidance to ask for specifics
4. Ask user: "What type of application would you like to create?"
5. User responds: "A Node.js API with Redis"
6. Use `recommend` tool with intent: "deploy a Node.js API with Redis cache"

### Why Use This Tool:
- Handles ambiguous requests gracefully
- Guides conversation toward actionable requirements
- Prevents misuse of other tools
- Improves user experience with unclear initial requests