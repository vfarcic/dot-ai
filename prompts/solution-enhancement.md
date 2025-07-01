# Single-Pass Solution Enhancement

## Current Solution
{current_solution}

## Detailed Resource Schemas
{detailed_schemas}

## Analysis Result
{analysis_result}

## User Response
{open_response}

## Instructions

You are enhancing a solution in a **single-pass architecture**. Analyze the user's response and return a complete enhanced solution that incorporates their requirements.

**SINGLE-PASS APPROACH**: Enhance the solution description, analysis, potentially add new resources, and populate missing question answers based on the user's requirements from their open response.

### Enhancement Strategy:

1. **Analyze User Requirements**: What specific capabilities or configurations is the user requesting?

2. **Enhance Solution Content**: 
   - Update the solution description to reflect the enhanced capabilities
   - Enhance the analysis to explain how the solution addresses the user's specific needs
   - Adjust the solution score if the enhancement significantly improves the solution

3. **Populate Question Answers**: 
   - Analyze the user's open response for specific configuration values
   - Fill in answers for questions that can be determined from the user's requirements
   - Only populate answers where the user provided clear information in their open response
   - Leave questions unanswered if the user didn't provide relevant information

4. **Add Resources if Needed**: 
   - Only if the Analysis Result indicates new resources are required (approach: "add_resources")
   - Use ONLY the schemas provided in "Detailed Resource Schemas" section
   - Add resources that are actually needed and supported by the available schemas

5. **Preserve Solution Structure**: 
   - Keep all existing questions intact 
   - The user's open response should remain as-is
   - Do not add new questions - this is a single-pass system

### Resource Enhancement Guidelines:
- **SCHEMA VALIDATION**: Only add resources that exist in the "Detailed Resource Schemas" section
- **CAPABILITY FOCUS**: Add resources only when the current solution cannot handle the user's requirements
- **NO REDUNDANCY**: Don't add resources if existing ones already provide the needed capabilities

## Response Format

### For Successful Enhancement:
Return the complete enhanced solution. Copy the entire current solution and enhance it with:
- Updated description and analysis
- Populated question answers based on the user's open response  
- Additional resources if needed
- Updated score

```json
{
  "enhancedSolution": {
    "type": "single",
    "score": 85,
    "description": "[ENHANCED_DESCRIPTION_INCORPORATING_USER_REQUIREMENTS]",
    "reasons": ["copy from current solution"],
    "analysis": "[ENHANCED_ANALYSIS_EXPLAINING_HOW_SOLUTION_MEETS_REQUIREMENTS]",
    "resources": [
      "copy all resources from current solution, plus any additionalResources if needed"
    ],
    "questions": {
      "required": [
        "copy all required questions from current solution, preserving existing answers"
      ],
      "basic": [
        "copy all basic questions from current solution, adding answers where user provided info"
      ],
      "advanced": [
        "copy all advanced questions from current solution, adding answers where user provided info"
      ],
      "open": {
        "question": "copy from current solution",
        "placeholder": "copy from current solution", 
        "answer": "copy from current solution - DO NOT MODIFY"
      }
    }
  }
}
```

### For Capability Gap:
```json
{
  "error": "CAPABILITY_GAP",
  "message": "[EXPLANATION_OF_WHY_CURRENT_SOLUTION_CANNOT_HANDLE_REQUEST]",
  "missingCapability": "[WHAT_USER_REQUESTED_THAT_CANNOT_BE_DONE]",
  "currentSolution": "[BRIEF_DESCRIPTION_OF_CURRENT_RESOURCES]",
  "suggestedAction": "[ADVICE_TO_START_OVER_WITH_DIFFERENT_INTENT]"
}
```

## Enhancement Examples:

### Example 1: Enhanced Description and Analysis
**User**: "I need it to handle 10x traffic with high availability"
**Current**: Basic Pod deployment solution
**Enhanced**: Description mentions auto-scaling and HA capabilities, analysis explains how the solution scales and maintains availability

### Example 2: Adding Resources
**User**: "I need persistent storage for user uploads"
**Current**: Basic application deployment
**Analysis Result**: "add_resources" with PersistentVolumeClaim recommended
**Enhanced**: Add PVC resource and update description to mention persistent storage capabilities

### Example 3: Capability Gap
**User**: "I need a managed database service"
**Current**: Application deployment solution
**Problem**: Kubernetes doesn't provide managed database services natively
**Response**: Return capability gap error, suggest starting over with database-specific intent

## Critical Requirements:
1. **RESPOND ONLY WITH JSON** - No explanations, no text, only the JSON object
2. **SINGLE-PASS MINDSET** - Return a complete enhanced solution, don't modify existing structure
3. **PRESERVE QUESTIONS** - Never alter the existing questions or their answers
4. **VALIDATE RESOURCES** - Only add resources that exist in the provided schemas
5. **ENHANCE CONTENT** - Focus on improving description and analysis to reflect user requirements
6. **LOGICAL ENHANCEMENTS** - Only enhance aspects that are actually improved by the user's requirements

**YOU MUST RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT**