/**
 * Packaging Module - Convert raw Kubernetes manifests to Helm charts or Kustomize overlays
 *
 * Implements AI-driven packaging as specified in PRD #248.
 * Raw manifests are always generated and validated first, then packaged based on outputFormat.
 */

import { loadPrompt } from './shared-prompt-loader';
import { Logger } from './error-handling';
import { DotAI } from './index';

/**
 * Output format types supported by packaging
 */
export type OutputFormat = 'raw' | 'helm' | 'kustomize';

/**
 * File entry in packaging response
 */
export interface PackageFile {
  relativePath: string;
  content: string;
}

/**
 * Result of packaging operation
 */
export interface PackagingResult {
  files: PackageFile[];
  format: OutputFormat;
}

/**
 * Error context for packaging retries
 */
interface PackagingErrorContext {
  attempt: number;
  previousOutput: string;
  validationError: string;
}

/**
 * Format-specific instructions for Helm chart generation
 */
const HELM_FORMAT_INSTRUCTIONS = `
### Helm Chart Structure

Generate the following files:

1. **Chart.yaml** - Chart metadata
   - \`apiVersion: v2\`
   - \`name\`: derived from application name
   - \`description\`: based on user intent
   - \`version: 0.1.0\`
   - \`appVersion\`: from image tag if available, otherwise \`1.0.0\`

2. **values.yaml** - Default configuration values
   - Include comments explaining each value
   - Group related values logically (e.g., \`image.repository\`, \`image.tag\`)
   - Use the actual values from user answers as defaults

3. **templates/*.yaml** - One file per Kubernetes resource type
   - **CRITICAL**: Include ALL manifests from the raw input - do not filter out any resources
   - This includes custom resources (CRDs) like Solution, Crossplane resources, etc.
   - Use \`{{ .Release.Name }}\` for resource names
   - Use \`{{ .Release.Namespace }}\` when namespace is referenced
   - Use \`{{ .Values.xxx }}\` for externalized configuration
   - Ensure label selectors match between related resources
   - Quote string values that might be interpreted as numbers: \`{{ .Values.someValue | quote }}\`
`;

/**
 * Format-specific example for Helm chart
 */
const HELM_FORMAT_EXAMPLE = `
### Example Helm Output

\`\`\`json
{
  "files": [
    {
      "relativePath": "Chart.yaml",
      "content": "apiVersion: v2\\nname: my-app\\ndescription: A Helm chart for my-app\\nversion: 0.1.0\\nappVersion: \\"1.0.0\\""
    },
    {
      "relativePath": "values.yaml",
      "content": "# Number of replicas\\nreplicaCount: 3\\n\\n# Container image\\nimage:\\n  repository: nginx\\n  tag: \\"1.21\\"\\n  pullPolicy: IfNotPresent"
    },
    {
      "relativePath": "templates/deployment.yaml",
      "content": "apiVersion: apps/v1\\nkind: Deployment\\nmetadata:\\n  name: {{ .Release.Name }}\\n  namespace: {{ .Release.Namespace }}\\nspec:\\n  replicas: {{ .Values.replicaCount }}\\n  ..."
    }
  ]
}
\`\`\`
`;

/**
 * Format-specific instructions for Kustomize generation
 */
const KUSTOMIZE_FORMAT_INSTRUCTIONS = `
### Kustomize Structure

Generate a production-ready Kustomize structure with base/ and overlays/ directories:

1. **base/kustomization.yaml** - Base kustomization file
   - \`apiVersion: kustomize.config.k8s.io/v1beta1\`
   - \`kind: Kustomization\`
   - List all resource files in \`resources:\` section (e.g., \`- deployment.yaml\`)
   - Do NOT include namespace, patches, or images here - base should be generic/reusable

2. **base/*.yaml** - Base Kubernetes manifests
   - One file per Kubernetes resource (deployment.yaml, service.yaml, solution.yaml, etc.)
   - **CRITICAL**: Include ALL manifests from the raw input - do not filter out any resources
   - This includes custom resources (CRDs) like Solution, Crossplane resources, etc.
   - Include complete, valid manifests
   - For container images: use ONLY the repository (e.g., \`image: nginx\` or \`image: ghcr.io/org/app\`) WITHOUT any tag - tags are set in overlays
   - Resource names should be consistent across all files

3. **overlays/production/kustomization.yaml** - Production overlay (THE KEY FILE FOR CUSTOMIZATION)
   - \`apiVersion: kustomize.config.k8s.io/v1beta1\`
   - \`kind: Kustomization\`
   - Reference base: \`resources: [../../base]\`
   - Use \`namespace:\` field with the user-specified namespace
   - **REQUIRED**: Use \`images:\` section to set image tags from user answers:
     \`\`\`yaml
     images:
       - name: <repository-without-tag>
         newTag: <tag-from-user-answer>
     \`\`\`
   - Use \`replicas:\` section if replicas were customized
   - Use \`patches:\` for other customizations (resources, env vars, etc.)

4. **kustomization.yaml** (root) - Points to production overlay for easy deployment
   - Simple file that references the production overlay: \`resources: [overlays/production]\`

**WHY THIS STRUCTURE**:
- \`base/\` contains generic, reusable manifests (like Helm templates)
- \`overlays/production/kustomization.yaml\` is like \`values.yaml\` - the single file users edit to customize
- Users can add \`overlays/staging/\`, \`overlays/dev/\` by copying the production overlay
- To upgrade: change \`newTag\` in the overlay, not the base manifests
`;

/**
 * Format-specific example for Kustomize
 */
const KUSTOMIZE_FORMAT_EXAMPLE = `
### Example Kustomize Output

\`\`\`json
{
  "files": [
    {
      "relativePath": "kustomization.yaml",
      "content": "apiVersion: kustomize.config.k8s.io/v1beta1\\nkind: Kustomization\\nresources:\\n  - overlays/production"
    },
    {
      "relativePath": "overlays/production/kustomization.yaml",
      "content": "apiVersion: kustomize.config.k8s.io/v1beta1\\nkind: Kustomization\\nnamespace: production\\nresources:\\n  - ../../base\\nimages:\\n  - name: nginx\\n    newTag: \\"1.21\\"\\nreplicas:\\n  - name: my-app\\n    count: 3"
    },
    {
      "relativePath": "base/kustomization.yaml",
      "content": "apiVersion: kustomize.config.k8s.io/v1beta1\\nkind: Kustomization\\nresources:\\n  - deployment.yaml\\n  - service.yaml"
    },
    {
      "relativePath": "base/deployment.yaml",
      "content": "apiVersion: apps/v1\\nkind: Deployment\\nmetadata:\\n  name: my-app\\nspec:\\n  replicas: 1\\n  selector:\\n    matchLabels:\\n      app: my-app\\n  template:\\n    metadata:\\n      labels:\\n        app: my-app\\n    spec:\\n      containers:\\n        - name: my-app\\n          image: nginx\\n          ports:\\n            - containerPort: 80"
    },
    {
      "relativePath": "base/service.yaml",
      "content": "apiVersion: v1\\nkind: Service\\nmetadata:\\n  name: my-app\\nspec:\\n  selector:\\n    app: my-app\\n  ports:\\n    - port: 80\\n      targetPort: 80"
    }
  ]
}
\`\`\`
`;

/**
 * Get format-specific configuration for prompt template
 */
function getFormatConfig(format: OutputFormat): {
  outputFormat: string;
  outputFormatDescription: string;
  formatSpecificInstructions: string;
  formatExample: string;
} {
  switch (format) {
    case 'helm':
      return {
        outputFormat: 'Helm Chart',
        outputFormatDescription: 'a complete Helm chart structure',
        formatSpecificInstructions: HELM_FORMAT_INSTRUCTIONS,
        formatExample: HELM_FORMAT_EXAMPLE
      };
    case 'kustomize':
      return {
        outputFormat: 'Kustomize',
        outputFormatDescription: 'a Kustomize overlay structure',
        formatSpecificInstructions: KUSTOMIZE_FORMAT_INSTRUCTIONS,
        formatExample: KUSTOMIZE_FORMAT_EXAMPLE
      };
    default:
      throw new Error(`Unsupported format for packaging: ${format}`);
  }
}

/**
 * Format questions and answers for prompt
 */
function formatQuestionsAndAnswers(solution: any): string {
  const lines: string[] = [];

  const questionCategories = ['required', 'basic', 'advanced'];
  for (const category of questionCategories) {
    const questions = solution.questions?.[category] || [];
    for (const q of questions) {
      if (q.answer !== undefined && q.answer !== null) {
        lines.push(`- **${q.question}**: ${q.answer}`);
      }
    }
  }

  if (solution.questions?.open?.answer) {
    lines.push(`- **Open requirements**: ${solution.questions.open.answer}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No user answers provided.';
}

/**
 * Parse JSON response from AI, handling potential markdown code blocks
 */
function parsePackagingResponse(response: string): PackageFile[] {
  // Try to extract JSON from markdown code blocks if present
  let jsonContent = response.trim();

  // Remove markdown code blocks if present
  // Use greedy match (*) not lazy (*?) to handle nested code blocks in content (e.g., README with ```bash examples)
  // The $ anchor ensures we match the LAST closing ```
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*)```\s*$/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1].trim();
  }

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (parseError) {
    const preview = jsonContent.slice(0, 200);
    throw new Error(`Failed to parse packaging response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}. Content preview: ${preview}...`);
  }

  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error('Invalid packaging response: missing files array');
  }

  // Validate each file entry
  for (const file of parsed.files) {
    if (typeof file.relativePath !== 'string' || typeof file.content !== 'string') {
      throw new Error('Invalid packaging response: each file must have relativePath and content strings');
    }
  }

  return parsed.files;
}

/**
 * Package raw Kubernetes manifests into Helm chart or Kustomize overlay
 *
 * @param rawManifests - Validated raw Kubernetes YAML manifests
 * @param solution - Solution data with intent, questions, answers
 * @param outputFormat - Target format ('helm' or 'kustomize')
 * @param outputPath - User-specified output path
 * @param dotAI - DotAI instance for AI calls
 * @param logger - Logger instance
 * @param errorContext - Optional error context for retries
 * @param interaction_id - Optional interaction ID for evaluation
 * @returns PackagingResult with files array
 */
export async function packageManifests(
  rawManifests: string,
  solution: any,
  outputFormat: OutputFormat,
  outputPath: string,
  dotAI: DotAI,
  logger: Logger,
  errorContext?: PackagingErrorContext,
  interaction_id?: string
): Promise<PackagingResult> {
  if (outputFormat === 'raw') {
    // Raw format - no packaging needed
    return {
      files: [{ relativePath: 'manifests.yaml', content: rawManifests }],
      format: 'raw'
    };
  }

  logger.info('Packaging manifests', {
    format: outputFormat,
    outputPath,
    isRetry: !!errorContext,
    attempt: errorContext?.attempt
  });

  // Get format-specific configuration
  const formatConfig = getFormatConfig(outputFormat);

  // Prepare template variables
  const previousAttempt = errorContext
    ? `Previous attempt output:\n\`\`\`json\n${errorContext.previousOutput}\n\`\`\``
    : 'None - this is the first attempt.';

  const errorDetails = errorContext
    ? `**Attempt**: ${errorContext.attempt}\n**Validation Error**: ${errorContext.validationError}`
    : 'None - this is the first attempt.';

  // Load and populate prompt template
  const prompt = loadPrompt('packaging-generation', {
    output_format: formatConfig.outputFormat,
    output_format_description: formatConfig.outputFormatDescription,
    intent: solution.intent || 'Kubernetes deployment',
    solution_description: solution.description || solution.title || 'No description available',
    raw_manifests: rawManifests,
    questions_and_answers: formatQuestionsAndAnswers(solution),
    output_path: outputPath,
    format_specific_instructions: formatConfig.formatSpecificInstructions,
    format_example: formatConfig.formatExample,
    previous_attempt: previousAttempt,
    error_details: errorDetails
  });

  // Call AI for packaging
  const aiProvider = dotAI.ai;
  const response = await aiProvider.sendMessage(prompt, `packaging-${outputFormat}`, {
    user_intent: solution.intent || 'Package Kubernetes manifests',
    interaction_id
  });

  // Parse response
  const files = parsePackagingResponse(response.content);

  logger.info('Packaging completed', {
    format: outputFormat,
    fileCount: files.length,
    files: files.map(f => f.relativePath)
  });

  return {
    files,
    format: outputFormat
  };
}
