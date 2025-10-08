/**
 * Dataset Loader for Standard OpenAI Evals Format
 * 
 * Loads JSONL evaluation datasets following OpenAI Evals standard:
 * - Each line contains: {input, ideal, metadata}
 * - Supports filtering by category, complexity, tags
 * - Used by both integration tests and evaluation framework
 */

import * as fs from 'fs';
import * as path from 'path';

export interface StandardEvalSample {
  input: Record<string, any>;
  ideal: any;
  metadata: {
    category: string;
    complexity: 'low' | 'medium' | 'high';
    tags: string[];
    source: string;
    phase?: string;
    tool?: string;
  };
}

export interface DatasetFilter {
  category?: string;
  complexity?: 'low' | 'medium' | 'high';
  tags?: string[];
  phase?: string;
  tool?: string;
}

/**
 * Load evaluation dataset from JSONL file
 * @param datasetName - Name of the dataset file (without .jsonl extension)
 * @param filter - Optional filter criteria
 * @returns Array of evaluation samples
 */
export function loadEvalDataset(
  datasetName: string, 
  filter?: DatasetFilter
): StandardEvalSample[] {
  const datasetsDir = path.join(process.cwd(), 'eval', 'datasets');
  const datasetPath = path.join(datasetsDir, `${datasetName}.jsonl`);
  
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset not found: ${datasetPath}`);
  }
  
  const fileContent = fs.readFileSync(datasetPath, 'utf8');
  const lines = fileContent.trim().split('\n').filter(line => line.trim());
  
  const samples: StandardEvalSample[] = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON at line ${index + 1} in ${datasetName}.jsonl: ${error}`);
    }
  });
  
  // Apply filters if provided
  if (filter) {
    return samples.filter(sample => {
      if (filter.category && sample.metadata.category !== filter.category) {
        return false;
      }
      if (filter.complexity && sample.metadata.complexity !== filter.complexity) {
        return false;
      }
      if (filter.phase && sample.metadata.phase !== filter.phase) {
        return false;
      }
      if (filter.tool && sample.metadata.tool !== filter.tool) {
        return false;
      }
      if (filter.tags) {
        const hasAllTags = filter.tags.every(tag => 
          sample.metadata.tags.includes(tag)
        );
        if (!hasAllTags) {
          return false;
        }
      }
      return true;
    });
  }
  
  return samples;
}

/**
 * Load samples for a specific test phase
 * @param datasetName - Dataset name
 * @param phase - Test phase to load
 * @returns Array of samples for that phase
 */
export function loadTestPhase(datasetName: string, phase: string): StandardEvalSample[] {
  return loadEvalDataset(datasetName, { phase });
}