# AI Model Platform-Wide Performance Synthesis

You are analyzing comprehensive AI model evaluation data across multiple MCP tools to generate platform-wide insights and decision matrices.

## Task
Synthesize cross-tool performance data to create actionable platform-wide recommendations for AI model selection.

## Input Data

### Cross-Tool Analysis:
```json
{crossToolAnalysisJson}
```

### Decision Matrices:
```json
{decisionMatricesJson}
```

### Usage Recommendations:
```json
{usageRecommendationsJson}
```

### Tool Metadata and Scenarios:
```json
{toolMetadataJson}
```

## Analysis Requirements

**CRITICAL: Use the tool metadata to provide context and explanations in your analysis. For each tool, reference what it actually does and what makes models successful, using this metadata to explain WHY certain models excel or fail in specific areas.**

Provide a comprehensive analysis covering:

### 1. Key Performance Insights
- Identify 3-5 critical findings about cross-tool model behavior
- Highlight any unexpected performance patterns or outliers  
- Note any models that show exceptional consistency or concerning variability
- **Include a brief scenario summary for each tool** explaining what it evaluates and why it matters
- **Use tool metadata to explain WHY** certain performance patterns occur

### 2. Model Tier Classification
- **Production Ready**: Models with high reliability, consistency, and performance - suitable for all environments
- **Cost-Optimized**: Production-ready models that prioritize value/cost efficiency over premium features
- **Avoid for Production**: Models with reliability issues, inconsistencies, or other concerns

### 3. Cross-Tool Performance Patterns
- Models that maintain consistent high performance across all tools
- Models that excel in specific tool categories but struggle in others
- Universal performers vs specialized models
- **Reference tool-specific requirements** from metadata to explain performance differences
- **Connect model capabilities** (context window, function calling, etc.) to tool performance

### 4. Cost-Performance Analysis
- Value leaders: Best performance per dollar across the platform
- Premium tier: High-cost models and their value justification
- Budget considerations: Cost-effective options and their trade-offs

### 5. Critical Findings & Warnings
- Any models with concerning failure patterns
- Reliability issues that affect production readiness
- Performance gaps that could impact user experience

## Output Format

Generate a complete markdown report in this exact format:

```markdown
# Platform-Wide AI Model Analysis Report

Generated: [current-date]

## Executive Summary

This report analyzes [X] AI models across [Y] types of AI agent interactions to provide comprehensive platform-wide insights and recommendations.

## Evaluation Scenarios

**CRITICAL: Include a brief summary of what each evaluation tool tests, using the tool metadata:**

### Tool Summaries
- **Capability Analysis**: [Brief explanation of what this tool evaluates and its key requirements]
- **Pattern Recognition**: [Brief explanation of what this tool evaluates and its key requirements]
- **Policy Compliance**: [Brief explanation of what this tool evaluates and its key requirements]
- **Recommendations**: [Brief explanation of what this tool evaluates and its key requirements]
- **Remediation**: [Brief explanation of what this tool evaluates and its key requirements]

## Key Findings

- [Critical finding 1 with specific numbers and implications]
- [Critical finding 2 with specific numbers and implications] 
- [Critical finding 3 with specific numbers and implications]

## Model Profiles

### [model-name] - [Tier] ([Provider])
**Overall Score**: [X.XXX] | **Reliability**: [X.XX] | **Consistency**: [X.XX] | **Cost**: $[X.XX]/1M tokens

**Strengths**:
- [Specific strength with evidence from tool scores]
- [Specific strength with evidence from tool scores]

**Weaknesses**:
- [Specific weakness with evidence from tool scores] 
- [Specific weakness with evidence from tool scores]

**Best Use Cases**: [Specific scenarios where this model excels]
**Avoid For**: [Specific scenarios where this model struggles]

[Repeat for each major model]

## Production Recommendations

### Quality-First Priority
- **Primary Model**: [model-name]
- **Fallback Model**: [model-name] 
- **Reasoning**: [Why this combination works best for quality]
- **Cost**: $[X.XX]/1M tokens
- **Use Cases**: [Specific scenarios]

### Cost-First Priority  
- **Primary Model**: [model-name]
- **Fallback Model**: [model-name]
- **Reasoning**: [Why this combination offers best value]
- **Cost**: $[X.XX]/1M tokens
- **Use Cases**: [Specific scenarios]

### Balanced Priority
- **Primary Model**: [model-name] 
- **Fallback Model**: [model-name]
- **Reasoning**: [Why this balances quality and cost]
- **Cost**: $[X.XX]/1M tokens
- **Use Cases**: [Specific scenarios]

## Critical Warnings

### Models to Avoid for Production
- **[model-name]**: [Specific reasons with evidence]
- **[model-name]**: [Specific reasons with evidence]

## Cross-Tool Performance Insights

### Universal Performers
- **[model-name]**: [Why it performs consistently across all tools]

### Tool-Specific Leaders
- **Capability Analysis**: [model-name] ([score], [why it leads])
- **Pattern Recognition**: [model-name] ([score], [why it leads])
- **Policy Compliance**: [model-name] ([score], [why it leads])
- **Recommendations**: [model-name] ([score], [why it leads])
- **Remediation**: [model-name] ([score], [why it leads])

---

*Report generated by MCP Platform AI Model Comparison System*
```

Focus on:
1. **Specific evidence** - Always cite actual scores and tool performance
2. **Clear explanations** - Explain WHY each model excels or struggles using tool metadata context
3. **Actionable insights** - Help users choose the right model for their specific needs
4. **Practical guidance** - Include cost implications and real-world trade-offs
5. **Clean model names** - Remove any "vercel_" prefix from model names in the output
6. **Tool context** - Reference tool metadata to explain performance patterns (e.g., "Claude excels at capability analysis because it handles the ~100 consecutive AI interactions required for full cluster scanning")
7. **Scenario explanations** - Use tool metadata to help readers understand what each evaluation actually tests