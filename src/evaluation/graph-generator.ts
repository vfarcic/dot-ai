import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import type { ModelPerformance } from './platform-synthesizer.js';

export interface GraphGenerationResult {
  success: boolean;
  graphPath?: string;
  error?: string;
}

/**
 * GraphGenerator creates data visualizations for platform synthesis reports.
 * Uses QuickChart.io API to generate chart images without requiring native dependencies.
 */
export class GraphGenerator {
  private outputDir: string;
  private quickchartBaseUrl = 'https://quickchart.io/chart';

  constructor(outputDir = './eval/analysis/platform/graphs') {
    this.outputDir = outputDir;
  }

  /**
   * Generates all or specific graphs for the platform report
   * @param modelPerformances Model performance data
   * @param graphNames Optional array of specific graph names to generate. If not provided, generates all graphs.
   *                   Valid names: 'performance-tiers', 'cost-vs-quality', 'reliability-comparison',
   *                   'tool-performance-heatmap', 'context-window-correlation'
   */
  async generateAllGraphs(
    modelPerformances: ModelPerformance[],
    graphNames?: string[]
  ): Promise<Record<string, GraphGenerationResult>> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const results: Record<string, GraphGenerationResult> = {};

    // Define all available graphs
    const allGraphs: Record<string, () => Promise<GraphGenerationResult>> = {
      'performance-tiers': () => this.generatePerformanceTiersGraph(modelPerformances),
      'cost-vs-quality': () => this.generateCostVsQualityGraph(modelPerformances),
      'reliability-comparison': () => this.generateReliabilityComparisonGraph(modelPerformances),
      'tool-performance-heatmap': () => this.generateToolPerformanceHeatmap(modelPerformances),
      'context-window-correlation': () => this.generateContextWindowCorrelationGraph(modelPerformances)
    };

    // If specific graphs requested, only generate those
    const graphsToGenerate = graphNames && graphNames.length > 0
      ? graphNames
      : Object.keys(allGraphs);

    // Generate requested graphs
    for (const graphName of graphsToGenerate) {
      if (allGraphs[graphName]) {
        results[graphName] = await allGraphs[graphName]();
      } else {
        console.warn(`⚠️  Unknown graph name: ${graphName}`);
      }
    }

    return results;
  }

  /**
   * Graph 1: Performance Tiers - Grouped bar chart showing score, reliability, and consistency
   */
  private async generatePerformanceTiersGraph(modelPerformances: ModelPerformance[]): Promise<GraphGenerationResult> {
    try {
      // Sort by average score descending, take top 10 models
      const topModels = modelPerformances
        .sort((a, b) => b.averageScore - a.averageScore)
        .slice(0, 10);

      // Clean model names (remove "vercel_" prefix)
      const labels = topModels.map(m => this.cleanModelName(m.modelId));
      const scores = topModels.map(m => m.averageScore);
      const reliability = topModels.map(m => m.reliabilityScore);
      const consistency = topModels.map(m => m.consistencyAcrossTools);

      const chartConfig = {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Overall Score',
              data: scores,
              backgroundColor: 'rgba(54, 162, 235, 0.9)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            },
            {
              label: 'Reliability',
              data: reliability,
              backgroundColor: 'rgba(75, 192, 192, 0.9)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1
            },
            {
              label: 'Consistency',
              data: consistency,
              backgroundColor: 'rgba(153, 102, 255, 0.9)',
              borderColor: 'rgba(153, 102, 255, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          plugins: {
            datalabels: {
              display: false
            }
          },
          title: {
            display: true,
            text: 'Model Performance Tiers: Score, Reliability, and Consistency',
            fontSize: 18,
            fontColor: '#FFFFFF',
            fontStyle: 'bold'
          },
          scales: {
            yAxes: [{
              ticks: {
                beginAtZero: true,
                max: 1.0,
                stepSize: 0.1,
                fontColor: '#FFFFFF',
                fontSize: 12
              },
              scaleLabel: {
                display: true,
                labelString: 'Score (0-1)',
                fontColor: '#FFFFFF',
                fontSize: 14
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.2)',
                zeroLineColor: 'rgba(255, 255, 255, 0.4)'
              }
            }],
            xAxes: [{
              ticks: {
                autoSkip: false,
                maxRotation: 45,
                minRotation: 45,
                fontColor: '#FFFFFF',
                fontSize: 11
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.1)'
              }
            }]
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              fontColor: '#FFFFFF',
              fontSize: 13
            }
          }
        }
      };

      const outputPath = path.join(this.outputDir, 'performance-tiers.png');
      await this.downloadChart(chartConfig, outputPath);

      return {
        success: true,
        graphPath: outputPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate performance tiers graph: ${error}`
      };
    }
  }

  /**
   * Graph 2: Cost vs Quality - Line chart showing input/output cost range per model
   */
  private async generateCostVsQualityGraph(modelPerformances: ModelPerformance[]): Promise<GraphGenerationResult> {
    try {
      // Filter out models with no pricing data and sort by quality score descending
      const modelsWithPricing = modelPerformances
        .filter(m =>
          m.pricing.input_cost_per_million_tokens > 0 || m.pricing.output_cost_per_million_tokens > 0
        )
        .sort((a, b) => b.averageScore - a.averageScore);

      // Create datasets: one for each model showing the cost range line
      const datasets = modelsWithPricing.map((m, idx) => {
        const inputCost = m.pricing.input_cost_per_million_tokens;
        const outputCost = m.pricing.output_cost_per_million_tokens;
        const color = this.getToolColor(idx);

        // Line from input cost to output cost at the model's quality score
        return {
          label: this.cleanModelName(m.modelId),
          data: [
            { x: inputCost, y: m.averageScore },
            { x: outputCost, y: m.averageScore }
          ],
          borderColor: color,
          backgroundColor: color,
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: false,
          showLine: true,
          tension: 0
        };
      });

      const chartConfig = {
        type: 'line',
        data: { datasets },
        options: {
          plugins: {
            datalabels: {
              display: false
            }
          },
          title: {
            display: true,
            text: 'Cost vs Quality Analysis (line shows input → output cost range)',
            fontSize: 18,
            fontColor: '#FFFFFF',
            fontStyle: 'bold'
          },
          scales: {
            xAxes: [{
              type: 'linear',
              scaleLabel: {
                display: true,
                labelString: 'Cost per 1M Tokens in $ (Input ← → Output)',
                fontColor: '#FFFFFF',
                fontSize: 14
              },
              ticks: {
                callback: function(value: number) {
                  return '$' + value;
                },
                fontColor: '#FFFFFF',
                fontSize: 12
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.2)',
                zeroLineColor: 'rgba(255, 255, 255, 0.4)'
              }
            }],
            yAxes: [{
              scaleLabel: {
                display: true,
                labelString: 'Overall Score',
                fontColor: '#FFFFFF',
                fontSize: 14
              },
              ticks: {
                beginAtZero: false,
                min: 0.3,
                max: 1.0,
                fontColor: '#FFFFFF',
                fontSize: 12
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.2)',
                zeroLineColor: 'rgba(255, 255, 255, 0.4)'
              }
            }]
          },
          legend: {
            display: true,
            position: 'right',
            labels: {
              fontColor: '#FFFFFF',
              fontSize: 10,
              boxWidth: 15,
              usePointStyle: true
            }
          }
        }
      };

      const outputPath = path.join(this.outputDir, 'cost-vs-quality.png');
      await this.downloadChart(chartConfig, outputPath);

      return {
        success: true,
        graphPath: outputPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate cost vs quality graph: ${error}`
      };
    }
  }

  /**
   * Graph 3: Reliability Comparison - Bar chart with reliability scores
   */
  private async generateReliabilityComparisonGraph(modelPerformances: ModelPerformance[]): Promise<GraphGenerationResult> {
    try {
      // Sort by reliability descending
      const sortedModels = modelPerformances
        .sort((a, b) => b.reliabilityScore - a.reliabilityScore);

      const labels = sortedModels.map(m => this.cleanModelName(m.modelId));
      const reliabilityScores = sortedModels.map(m => m.reliabilityScore);

      // Create separate datasets for legend
      const datasets = [
        {
          label: 'High Reliability (≥0.9)',
          data: reliabilityScores.map(score => score >= 0.9 ? score : null),
          backgroundColor: 'rgba(75, 192, 192, 0.8)',
          borderWidth: 1
        },
        {
          label: 'Medium Reliability (0.7-0.9)',
          data: reliabilityScores.map(score => score >= 0.7 && score < 0.9 ? score : null),
          backgroundColor: 'rgba(255, 206, 86, 0.8)',
          borderWidth: 1
        },
        {
          label: 'Low Reliability (<0.7)',
          data: reliabilityScores.map(score => score < 0.7 ? score : null),
          backgroundColor: 'rgba(255, 99, 132, 0.8)',
          borderWidth: 1
        }
      ];

      const chartConfig = {
        type: 'horizontalBar',
        data: {
          labels,
          datasets
        },
        options: {
          plugins: {
            datalabels: {
              display: false
            }
          },
          title: {
            display: true,
            text: 'Model Reliability Comparison',
            fontSize: 18,
            fontColor: '#FFFFFF',
            fontStyle: 'bold'
          },
          scales: {
            xAxes: [{
              stacked: true,
              ticks: {
                beginAtZero: true,
                max: 1.0,
                stepSize: 0.1,
                fontColor: '#FFFFFF',
                fontSize: 12
              },
              scaleLabel: {
                display: true,
                labelString: 'Reliability Score (0-1)',
                fontColor: '#FFFFFF',
                fontSize: 14
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.2)',
                zeroLineColor: 'rgba(255, 255, 255, 0.4)'
              }
            }],
            yAxes: [{
              stacked: true,
              ticks: {
                fontColor: '#FFFFFF',
                fontSize: 11
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.1)'
              }
            }]
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              fontColor: '#FFFFFF',
              fontSize: 12
            }
          }
        }
      };

      const outputPath = path.join(this.outputDir, 'reliability-comparison.png');
      await this.downloadChart(chartConfig, outputPath);

      return {
        success: true,
        graphPath: outputPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate reliability comparison graph: ${error}`
      };
    }
  }

  /**
   * Graph 4: Tool Performance Heatmap - Shows model scores per tool
   */
  private async generateToolPerformanceHeatmap(modelPerformances: ModelPerformance[]): Promise<GraphGenerationResult> {
    try {
      // Get all unique tool names
      const toolNames = new Set<string>();
      modelPerformances.forEach(m => {
        Object.keys(m.toolScores).forEach(tool => toolNames.add(tool));
      });
      const tools = Array.from(toolNames).sort();

      // Sort models by average score
      const sortedModels = modelPerformances
        .sort((a, b) => b.averageScore - a.averageScore)
        .slice(0, 10); // Top 10 models

      // Create matrix data
      const labels = sortedModels.map(m => this.cleanModelName(m.modelId));

      const datasets = tools.map((tool, idx) => ({
        label: tool.charAt(0).toUpperCase() + tool.slice(1),
        data: sortedModels.map(m => m.toolScores[tool] || 0),
        backgroundColor: this.getToolColor(idx),
        borderWidth: 1
      }));

      const chartConfig = {
        type: 'horizontalBar',
        data: {
          labels,
          datasets
        },
        options: {
          plugins: {
            datalabels: {
              display: false
            }
          },
          title: {
            display: true,
            text: 'Tool-Specific Performance Patterns',
            fontSize: 18,
            fontColor: '#FFFFFF',
            fontStyle: 'bold'
          },
          scales: {
            xAxes: [{
              stacked: false,
              ticks: {
                beginAtZero: true,
                max: 1.0,
                stepSize: 0.2,
                fontColor: '#FFFFFF',
                fontSize: 12
              },
              scaleLabel: {
                display: true,
                labelString: 'Tool Score',
                fontColor: '#FFFFFF',
                fontSize: 14
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.2)',
                zeroLineColor: 'rgba(255, 255, 255, 0.4)'
              }
            }],
            yAxes: [{
              stacked: false,
              ticks: {
                fontColor: '#FFFFFF',
                fontSize: 11
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.1)'
              }
            }]
          },
          legend: {
            display: true,
            position: 'right',
            labels: {
              fontColor: '#FFFFFF',
              fontSize: 12
            }
          }
        }
      };

      const outputPath = path.join(this.outputDir, 'tool-performance-heatmap.png');
      await this.downloadChart(chartConfig, outputPath);

      return {
        success: true,
        graphPath: outputPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate tool performance heatmap: ${error}`
      };
    }
  }

  /**
   * Graph 5: Context Window Correlation - Scatter plot showing context window vs performance
   */
  private async generateContextWindowCorrelationGraph(modelPerformances: ModelPerformance[]): Promise<GraphGenerationResult> {
    try {
      const scatterData = modelPerformances.map((m) => ({
        x: m.capabilities.context_window / 1000, // Convert to thousands for readability
        y: m.averageScore,
        r: 8,
        label: this.cleanModelName(m.modelId)
      }));

      const chartConfig = {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Models',
            data: scatterData,
            backgroundColor: 'rgba(153, 102, 255, 0.7)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 2,
            pointRadius: 10
          }]
        },
        options: {
          layout: {
            padding: {
              right: 300,
              left: 20,
              top: 20,
              bottom: 20
            }
          },
          plugins: {
            datalabels: {
              display: true,
              align: 'right',
              offset: 12,
              color: '#FFFFFF',
              font: {
                size: 20
              },
              formatter: (value: any) => value.label
            }
          },
          title: {
            display: true,
            text: 'Context Window Size vs Performance',
            fontSize: 18,
            fontColor: '#FFFFFF',
            fontStyle: 'bold'
          },
          scales: {
            xAxes: [{
              type: 'linear',
              scaleLabel: {
                display: true,
                labelString: 'Context Window Size (K tokens)',
                fontColor: '#FFFFFF',
                fontSize: 14
              },
              ticks: {
                callback: (value: number) => value + 'K',
                fontColor: '#FFFFFF',
                fontSize: 12
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.2)',
                zeroLineColor: 'rgba(255, 255, 255, 0.4)'
              }
            }],
            yAxes: [{
              scaleLabel: {
                display: true,
                labelString: 'Overall Score',
                fontColor: '#FFFFFF',
                fontSize: 14
              },
              ticks: {
                beginAtZero: false,
                min: 0.3,
                max: 1.0,
                fontColor: '#FFFFFF',
                fontSize: 12
              },
              gridLines: {
                color: 'rgba(255, 255, 255, 0.2)',
                zeroLineColor: 'rgba(255, 255, 255, 0.4)'
              }
            }]
          },
          legend: {
            display: false
          },
          tooltips: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFontColor: '#FFFFFF',
            bodyFontColor: '#FFFFFF',
            callbacks: {
              label: (tooltipItem: any, data: any) => {
                const dataset = data.datasets[tooltipItem.datasetIndex];
                const point = dataset.data[tooltipItem.index];
                return `${point.label}: ${point.y.toFixed(3)} (${Math.round(point.x)}K tokens)`;
              }
            }
          }
        }
      };

      const outputPath = path.join(this.outputDir, 'context-window-correlation.png');
      await this.downloadChart(chartConfig, outputPath, 1400, 700);

      return {
        success: true,
        graphPath: outputPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate context window correlation graph: ${error}`
      };
    }
  }

  /**
   * Downloads a chart from QuickChart.io API and saves it as PNG
   */
  private async downloadChart(chartConfig: any, outputPath: string, width = 1000, height = 600): Promise<void> {
    return new Promise((resolve, reject) => {
      const chartJson = JSON.stringify(chartConfig);
      const url = `${this.quickchartBaseUrl}?c=${encodeURIComponent(chartJson)}&width=${width}&height=${height}&format=png&backgroundColor=black`;

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`QuickChart API returned status ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`✅ Graph saved: ${outputPath}`);
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(outputPath, () => {}); // Clean up partial file
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Cleans model names by removing provider prefixes
   */
  private cleanModelName(modelId: string): string {
    // Remove "vercel_" prefix and timestamp suffix
    return modelId
      .replace(/^vercel_/, '')
      .replace(/_\d{4}-\d{2}-\d{2}$/, '')
      .replace(/_/g, '-');
  }

  /**
   * Returns a consistent color for each tool index (supports up to 10 tools)
   */
  private getToolColor(index: number): string {
    const colors = [
      'rgba(255, 99, 132, 0.8)',   // Red
      'rgba(54, 162, 235, 0.8)',   // Blue
      'rgba(255, 206, 86, 0.8)',   // Yellow
      'rgba(75, 192, 192, 0.8)',   // Green
      'rgba(153, 102, 255, 0.8)',  // Purple
      'rgba(255, 159, 64, 0.8)',   // Orange
      'rgba(199, 199, 199, 0.8)',  // Grey
      'rgba(83, 102, 255, 0.8)',   // Indigo
      'rgba(255, 99, 255, 0.8)',   // Pink
      'rgba(99, 255, 132, 0.8)'    // Light Green
    ];
    return colors[index % colors.length];
  }
}
