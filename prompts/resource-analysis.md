# Resource Analysis for Enhancement

## Current Solution
{current_solution}

## User Request
{user_request}

## Available Resource Types
{available_resource_types}

## Instructions

Analyze the user's request and determine if the current solution can fulfill it or if additional resources are needed.

### STEP 0: Handle No-Requirements Cases
If the user request is any of: "N/A", "no requirements", "none", "nothing", "no", or similar variations:
- This indicates the user has no additional requirements beyond current configuration
- ALWAYS respond with: `{"canHandle": true, "approach": "complete_existing_questions", "reasoning": "User specified no additional requirements beyond current configuration"}`
- Do NOT proceed to capability gap analysis in these cases
- Skip all other steps and return the success response immediately

### STEP 1: Analyze Current Solution Capabilities
- Review the current solution's resources and their capabilities
- Check if missing question answers can fulfill the user's request
- Determine if the current resources support the requested functionality
- **IMPORTANT**: Note which resources control deployment/pod creation and management

### STEP 2: Determine Resource Needs
If the current solution CANNOT fulfill the request:
- Identify what type of capability is needed (storage, networking, database, etc.)
- **CRITICAL**: Check if suggested resources can actually integrate with current solution
- Consider resource control relationships and dependencies
- Verify that new resources can be meaningfully connected to existing resources
- Only suggest resources if they can functionally integrate with the current solution
- If no meaningful integration is possible, classify as capability gap

### STEP 3: Integration Analysis
Before suggesting additional resources, perform these specific checks:

#### A. Controller Resource Detection
- **Check if current resources are high-level controllers** (Custom Resources, Operators, Helm Charts, etc.)
- **Identify what they control**: Do they manage Deployment, Pod, Service, or Ingress creation?
- **Determine autonomy level**: Do they fully control the application lifecycle?

#### B. Integration Feasibility 
- **Volume Mounting**: If user needs storage, can volumes be mounted to pods controlled by existing resources?
- **Networking**: If user needs networking, can traffic be routed to pods managed by existing resources?  
- **Environment Variables**: Can configuration be injected into pods controlled by existing resources?
- **Resource Limits**: Can compute/memory limits be set on pods managed by existing resources?

#### C. Capability Gap Detection
If existing resources are high-level controllers that fully manage pod/deployment lifecycle:
- **No volume mount points**: Cannot attach external storage volumes
- **No network customization**: Cannot modify networking beyond controller's scope  
- **No direct pod access**: Cannot inject custom configuration
- **Classify as CAPABILITY_GAP**: Adding standalone resources won't actually provide functionality

### STEP 4: Provide Analysis Result

## Response Format (JSON ONLY)

### If current solution CAN handle the request:
```json
{
  "canHandle": true,
  "approach": "complete_existing_questions",
  "reasoning": "AppClaim supports scaling via spec.scaling.enabled/min/max fields"
}
```

### If user has no additional requirements ("N/A", "none", etc.):
```json
{
  "canHandle": true,
  "approach": "complete_existing_questions",
  "reasoning": "User specified no additional requirements beyond current configuration"
}
```

### If additional resources are needed:
```json
{
  "canHandle": false,
  "approach": "add_resources",
  "reasoning": "AppClaim does not support persistent storage",
  "requiredCapability": "persistent storage",
  "suggestedResources": ["PersistentVolumeClaim", "StorageClass"],
  "resourceJustification": "PersistentVolumeClaim provides pod-independent storage, StorageClass defines storage parameters"
}
```

### If request cannot be fulfilled:
```json
{
  "canHandle": false,
  "approach": "capability_gap",
  "reasoning": "Current solution uses high-level controller that fully manages application lifecycle",
  "integrationIssue": "Controller resource manages pod/deployment creation, preventing integration with external resources that require pod-level access",
  "controllerType": "Custom Resource/Operator/High-level abstraction",
  "requestedCapability": "User's requested functionality",
  "suggestedAction": "Start over with intent that includes these requirements from the beginning"
}
```

## Integration Analysis Examples:

**Example 1 - Database with High-Level Controller:**
- Current: High-level resource that manages application lifecycle
- Request: External database connectivity  
- Analysis: High-level resource controls networking/service creation, cannot connect to external databases
- Result: capability_gap

**Example 2 - Compatible Resources:**
- Current: Standard Deployment
- Request: Load balancing
- Analysis: Service can route traffic to Deployment pods via label selectors
- Result: add_resources (Service)

## Critical Requirements:
1. **RESPOND ONLY WITH JSON** - No explanations, no text, only the JSON object
2. **Only suggest resources from Available Resource Types list**
3. **Be specific about capability gaps**
4. **Provide clear reasoning for decisions**
5. **Always check resource integration feasibility**

**YOU MUST RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT**