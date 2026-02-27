import type {
  EvaluationResult,
  PromptPattern,
  DimensionStats,
  PromptRule,
  RuleSet,
} from '../types/index.js';

/**
 * The RuleSetExtractor analyzes evaluation results to discover which
 * prompt structural dimensions a model is biased toward.
 *
 * Core algorithm:
 * 1. Group results by each dimension value (e.g., all "enumerated" patterns)
 * 2. Compute mean and std-dev of overall scores per group
 * 3. Rank values within each dimension
 * 4. Generate rules: "prefer X over Y" with confidence based on effect size
 * 5. Compose a meta-prompt and rewrite instructions from the rules
 */
export class RuleSetExtractor {
  /**
   * Compute per-dimension statistics from evaluation results.
   */
  computeStats(
    patterns: PromptPattern[],
    results: EvaluationResult[],
  ): DimensionStats[] {
    const patternMap = new Map(patterns.map(p => [p.id, p]));
    const resultMap = new Map(results.map(r => [r.patternId, r]));

    const dimensions = [
      'structure',
      'detail',
      'tone',
      'contextPlacement',
      'constraintStyle',
      'outputSpec',
    ] as const;

    const allStats: DimensionStats[] = [];

    for (const dim of dimensions) {
      // Group scores by dimension value
      const groups = new Map<string, number[]>();

      for (const result of results) {
        const pattern = patternMap.get(result.patternId);
        if (!pattern) continue;

        const value = pattern[dim];
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value)!.push(result.scores.overall);
      }

      // Compute stats per group
      for (const [value, scores] of groups) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
        const stdDev = Math.sqrt(variance);

        // Also compute per-sub-score means
        const dimResults = results.filter(r => {
          const p = patternMap.get(r.patternId);
          return p && p[dim] === value;
        });

        allStats.push({
          dimension: dim,
          value,
          sampleSize: scores.length,
          meanOverall: round(mean),
          stdDevOverall: round(stdDev),
          meanAdherence: round(avg(dimResults.map(r => r.scores.instruction_adherence))),
          meanFormatCompliance: round(avg(dimResults.map(r => r.scores.format_compliance))),
          meanCompleteness: round(avg(dimResults.map(r => r.scores.completeness))),
          meanClarity: round(avg(dimResults.map(r => r.scores.clarity))),
        });
      }
    }

    return allStats;
  }

  /**
   * Extract rules from statistics. Each rule identifies the best and worst
   * values for a dimension with a confidence score.
   */
  extractRules(stats: DimensionStats[]): PromptRule[] {
    const rules: PromptRule[] = [];

    // Group stats by dimension
    const byDimension = new Map<string, DimensionStats[]>();
    for (const s of stats) {
      if (!byDimension.has(s.dimension)) byDimension.set(s.dimension, []);
      byDimension.get(s.dimension)!.push(s);
    }

    for (const [dimension, dimStats] of byDimension) {
      // Sort by mean overall score descending
      const sorted = [...dimStats].sort((a, b) => b.meanOverall - a.meanOverall);

      if (sorted.length < 2) continue;

      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const spread = best.meanOverall - worst.meanOverall;

      // Confidence: high if large spread and low variance in the top group
      const confidence = computeConfidence(spread, best.stdDevOverall, best.sampleSize);

      // Top values: within 1 std-dev of the best
      const threshold = best.meanOverall - best.stdDevOverall;
      const preferredValues = sorted
        .filter(s => s.meanOverall >= threshold)
        .map(s => s.value);

      // Bottom values: significantly below average
      const overallMean = avg(sorted.map(s => s.meanOverall));
      const avoidValues = sorted
        .filter(s => s.meanOverall < overallMean - 0.05)
        .map(s => s.value);

      const evidence = buildEvidence(dimension, sorted);

      rules.push({
        dimension,
        recommendation: buildRecommendation(dimension, preferredValues, avoidValues),
        preferredValues,
        avoidValues,
        confidence: round(confidence),
        evidence,
      });
    }

    // Sort rules by confidence descending
    return rules.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Compose a full RuleSet from patterns and evaluation results.
   */
  buildRuleSet(
    modelId: string,
    modelName: string,
    patterns: PromptPattern[],
    results: EvaluationResult[],
  ): RuleSet {
    const stats = this.computeStats(patterns, results);
    const rules = this.extractRules(stats);

    return {
      modelId,
      modelName,
      generatedAt: new Date().toISOString(),
      patternsTested: results.length,
      rules,
      metaPrompt: this.composeMetaPrompt(rules, modelName),
      rewriteInstructions: this.composeRewriteInstructions(rules, modelName),
    };
  }

  /**
   * Build a system-level meta-prompt that embodies all the discovered rules.
   * This can be prepended to any prompt to the target model.
   */
  private composeMetaPrompt(rules: PromptRule[], modelName: string): string {
    const highConfidence = rules.filter(r => r.confidence >= 0.6);
    const medConfidence = rules.filter(r => r.confidence >= 0.3 && r.confidence < 0.6);

    const sections: string[] = [
      `# Optimized Prompt Rules for ${modelName}`,
      '',
      'These rules were derived empirically by testing thousands of prompt patterns.',
      'Apply these structural preferences when constructing prompts for this model.',
      '',
    ];

    if (highConfidence.length > 0) {
      sections.push('## Strong Preferences (High Confidence)');
      for (const rule of highConfidence) {
        sections.push(`- ${rule.recommendation}`);
      }
      sections.push('');
    }

    if (medConfidence.length > 0) {
      sections.push('## Moderate Preferences');
      for (const rule of medConfidence) {
        sections.push(`- ${rule.recommendation}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Build instructions for how to rewrite any arbitrary prose
   * to match the model's preferred prompt structure.
   */
  private composeRewriteInstructions(rules: PromptRule[], modelName: string): string {
    const lines: string[] = [
      `# How to Rewrite Prompts for ${modelName}`,
      '',
      'When rewriting a prompt to optimize it for this model, apply these transformations:',
      '',
    ];

    for (const rule of rules) {
      if (rule.confidence < 0.3) continue;

      switch (rule.dimension) {
        case 'structure':
          lines.push(`## Structure`);
          lines.push(`Restructure the prompt to use a ${rule.preferredValues[0]} style.`);
          if (rule.preferredValues.length > 1) {
            lines.push(`Alternative structures that also work well: ${rule.preferredValues.slice(1).join(', ')}.`);
          }
          if (rule.avoidValues.length > 0) {
            lines.push(`Avoid: ${rule.avoidValues.join(', ')} structures.`);
          }
          break;

        case 'detail':
          lines.push(`## Detail Level`);
          lines.push(`Aim for a ${rule.preferredValues[0]} level of detail in instructions.`);
          break;

        case 'tone':
          lines.push(`## Tone`);
          lines.push(`Use a ${rule.preferredValues[0]} tone when writing prompts.`);
          break;

        case 'contextPlacement':
          lines.push(`## Context Placement`);
          const placement = rule.preferredValues[0]?.replace(/_/g, ' ');
          lines.push(`Place context ${placement} in the prompt.`);
          break;

        case 'constraintStyle':
          lines.push(`## Constraints`);
          lines.push(`Express constraints using the ${rule.preferredValues[0]} style.`);
          break;

        case 'outputSpec':
          lines.push(`## Output Format`);
          lines.push(`When specifying output format, ${rule.preferredValues[0]} works best.`);
          break;
      }
      lines.push('');
    }

    lines.push('## Rewrite Process');
    lines.push('1. Identify the core instruction in the original prompt.');
    lines.push('2. Separate context from instruction.');
    lines.push('3. Reformat using the structural preferences above.');
    lines.push('4. Add constraints in the preferred style.');
    lines.push('5. Specify output format if applicable.');
    lines.push('6. Review for clarity and remove ambiguity.');

    return lines.join('\n');
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function computeConfidence(spread: number, stdDev: number, sampleSize: number): number {
  // Cohen's d-like effect size, adjusted for sample size
  const effectSize = stdDev > 0 ? spread / stdDev : spread * 10;
  const sampleFactor = Math.min(1, sampleSize / 30); // need at least 30 for confidence
  return Math.min(1, effectSize * sampleFactor * 0.5);
}

function buildRecommendation(
  dimension: string,
  preferred: string[],
  avoid: string[],
): string {
  const dimLabel = dimension.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  let rec = `For ${dimLabel}, prefer "${preferred[0]}"`;
  if (preferred.length > 1) {
    rec += ` (also good: ${preferred.slice(1).map(v => `"${v}"`).join(', ')})`;
  }
  if (avoid.length > 0) {
    rec += `. Avoid: ${avoid.map(v => `"${v}"`).join(', ')}`;
  }
  return rec + '.';
}

function buildEvidence(dimension: string, sorted: DimensionStats[]): string {
  const lines = sorted.map(
    s => `${s.value}: mean=${s.meanOverall} (n=${s.sampleSize}, std=${s.stdDevOverall})`,
  );
  return `Ranking for ${dimension}:\n${lines.join('\n')}`;
}
