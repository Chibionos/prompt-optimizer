import type { PromptPattern, EvaluationResult, Config } from '../types/index.js';
import { OpenRouterClient } from '../openrouter/client.js';
import { scoreWithJudge, scoreWithHeuristics } from './scorer.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface EvaluationProgress {
  completed: number;
  total: number;
  currentPattern: string;
  errors: number;
}

type ProgressCallback = (progress: EvaluationProgress) => void;

/**
 * The evaluation engine runs each prompt pattern against a target model,
 * collects the response, and scores it. Results are streamed to disk
 * incrementally so we can resume after interruption.
 */
export class EvaluationEngine {
  private client: OpenRouterClient;
  private config: Config;
  private judgeModel: string;

  constructor(client: OpenRouterClient, config: Config, judgeModel?: string) {
    this.client = client;
    this.config = config;
    // Default judge: use a capable model for evaluation
    this.judgeModel = judgeModel ?? 'openai/gpt-4o-mini';
  }

  /**
   * Evaluate all patterns against a single model.
   * Uses concurrency limiting and incremental saves.
   */
  async evaluateModel(
    modelId: string,
    patterns: PromptPattern[],
    onProgress?: ProgressCallback,
  ): Promise<EvaluationResult[]> {
    const resultsDir = join(this.config.outputDir, 'evaluations', sanitizeFilename(modelId));
    await mkdir(resultsDir, { recursive: true });

    // Load any existing results (for resume capability)
    const existing = await this.loadExistingResults(resultsDir);
    const existingIds = new Set(existing.map(r => r.patternId));
    const remaining = patterns.filter(p => !existingIds.has(p.id));

    const results = [...existing];
    let errors = 0;

    // Process with concurrency limit
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(this.config.concurrencyLimit);

    const tasks = remaining.map((pattern, idx) =>
      limit(async () => {
        try {
          const result = await this.evaluatePattern(modelId, pattern);
          results.push(result);

          onProgress?.({
            completed: results.length,
            total: patterns.length,
            currentPattern: pattern.id,
            errors,
          });

          // Save every 50 results
          if (results.length % 50 === 0) {
            await this.saveResults(resultsDir, results);
          }

          return result;
        } catch (err) {
          errors++;
          onProgress?.({
            completed: results.length,
            total: patterns.length,
            currentPattern: pattern.id,
            errors,
          });
          return null;
        }
      })
    );

    await Promise.all(tasks);

    // Final save
    await this.saveResults(resultsDir, results);

    return results;
  }

  /**
   * Evaluate a single pattern against a model.
   */
  private async evaluatePattern(
    modelId: string,
    pattern: PromptPattern,
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    const response = await this.client.chatWithRetry(modelId, [
      { role: 'user', content: pattern.renderedPrompt },
    ], {
      maxTokens: 1024,
      temperature: 0.3,
    });

    const latencyMs = Date.now() - startTime;
    const responseText = response.choices[0]?.message?.content ?? '';

    // Score the response
    let scores: EvaluationResult['scores'];
    try {
      scores = await scoreWithJudge(this.client, this.judgeModel, pattern, responseText);
    } catch {
      scores = scoreWithHeuristics(pattern, responseText);
    }

    return {
      patternId: pattern.id,
      modelId,
      response: responseText,
      scores,
      latencyMs,
      tokenUsage: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async loadExistingResults(dir: string): Promise<EvaluationResult[]> {
    try {
      const raw = await readFile(join(dir, 'results.json'), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private async saveResults(dir: string, results: EvaluationResult[]): Promise<void> {
    // Save JSON format
    await writeFile(
      join(dir, 'results.json'),
      JSON.stringify(results, null, 2),
    );

    // Save CSV format
    await this.saveResultsCSV(dir, results);
  }

  private async saveResultsCSV(dir: string, results: EvaluationResult[]): Promise<void> {
    if (results.length === 0) return;

    const headers = [
      'patternId',
      'modelId',
      'instruction_adherence',
      'format_compliance',
      'completeness',
      'clarity',
      'no_hallucination',
      'overall',
      'latencyMs',
      'promptTokens',
      'completionTokens',
      'response_preview',
    ];

    const rows = results.map(r => [
      r.patternId,
      r.modelId,
      r.scores.instruction_adherence.toFixed(3),
      r.scores.format_compliance.toFixed(3),
      r.scores.completeness.toFixed(3),
      r.scores.clarity.toFixed(3),
      r.scores.no_hallucination.toFixed(3),
      r.scores.overall.toFixed(3),
      r.latencyMs,
      r.tokenUsage.prompt,
      r.tokenUsage.completion,
      r.response.substring(0, 100).replace(/[\r\n]+/g, ' ').replace(/,/g, ';'),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    await writeFile(join(dir, 'results.csv'), csv);
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
}
