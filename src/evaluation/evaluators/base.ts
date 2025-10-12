/**
 * Standard Evaluator Interface Following OpenAI Evals Pattern
 * 
 * Based on OpenAI Evals framework standards:
 * - Each evaluator has a name and description
 * - evaluate() method takes input, output, and optional ideal
 * - Returns standardized EvaluationScore
 */

export interface EvaluationScore {
  key: string;           // Evaluator name (e.g., "accuracy", "relevance")
  score: number;         // Numeric score (0.0 to 1.0)
  comment?: string;      // Optional reasoning/explanation
  confidence?: number;   // Confidence in the evaluation (0.0 to 1.0)
}

export interface EvaluationSample {
  input: Record<string, any>;
  output: string;
  ideal?: any;
  metadata?: Record<string, any>;
}

export interface PerformanceMetrics {
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd?: number;
  iterations?: number;
  tool_calls_executed?: number;
  cache_hit_rate?: number;
  model_version: string;
}

export interface EvaluationResult {
  sample_id: string;
  model: string;
  timestamp: string;
  
  // Quality metrics (AI-graded)
  quality_scores: Record<string, EvaluationScore>;
  
  // Performance metrics (system-measured)
  performance: PerformanceMetrics;
  
  // Derived efficiency metrics
  efficiency: {
    quality_per_second: number;    // overall_quality / duration_seconds
    quality_per_dollar?: number;   // overall_quality / cost_usd
    quality_per_token: number;     // overall_quality / total_tokens
  };
  
  // Raw data for analysis
  input: Record<string, any>;
  output: string;
  ideal?: any;
}

