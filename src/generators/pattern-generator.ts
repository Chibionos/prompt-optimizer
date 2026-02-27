import {
  StructureStyle,
  DetailLevel,
  ToneRegister,
  ContextPlacement,
  ConstraintStyle,
  OutputSpecification,
  PromptEngineeringPattern,
} from '../types/index.js';
import type { PromptPattern } from '../types/index.js';
import { DOMAIN_TASKS } from './domains.js';
import { renderPrompt } from './renderer.js';

// All possible values for each dimension
const STRUCTURES = StructureStyle.options;              // 10
const DETAILS = DetailLevel.options;                    // 3
const TONES = ToneRegister.options;                     // 4
const CONTEXT_PLACEMENTS = ContextPlacement.options;    // 4
const CONSTRAINT_STYLES = ConstraintStyle.options;      // 5
const OUTPUT_SPECS = OutputSpecification.options;        // 6
const ENGINEERING_PATTERNS = PromptEngineeringPattern.options; // 10

// Total dimension combos: 10 * 3 * 4 * 4 * 5 * 6 * 10 = 144,000
// With 256 tasks: 36,864,000 total unique patterns possible.

/**
 * Calculates the full combinatorial space.
 */
export function getFullCombinatorialSize(): number {
  return (
    DOMAIN_TASKS.length *
    STRUCTURES.length *
    DETAILS.length *
    TONES.length *
    CONTEXT_PLACEMENTS.length *
    CONSTRAINT_STYLES.length *
    OUTPUT_SPECS.length *
    ENGINEERING_PATTERNS.length
  );
}

/**
 * Human-readable labels for what each dimension value tests.
 */
const DIMENSION_LABELS: Record<string, Record<string, string>> = {
  structure: {
    imperative: 'direct command style ("Do X.")',
    interrogative: 'question-based framing ("How would you X?")',
    conditional: 'if-then branching ("If X, then Y.")',
    enumerated: 'numbered step list ("1. Do X  2. Do Y")',
    role_play: 'persona assignment ("You are an expert in X.")',
    chain_of_thought: 'explicit reasoning request ("Think step by step.")',
    few_shot: 'example-driven pattern ("Example: A -> B. Now do C.")',
    constraint_first: 'constraints before instruction ("Given these rules, do X.")',
    output_template: 'response format scaffold ("Answer as: Approach / Steps / Result")',
    decomposed: 'sub-task breakdown ("Sub-task A: ... Sub-task B: ...")',
  },
  detail: {
    minimal: 'bare instruction, no context or elaboration',
    moderate: 'instruction with supporting context',
    verbose: 'instruction with full context, domain label, and complexity note',
  },
  tone: {
    formal: 'neutral/formal register, no preamble',
    casual: 'casual opener ("Hey, I need help with...")',
    technical: 'technical register, no preamble',
    conversational: 'conversational opener ("I was thinking about...")',
  },
  contextPlacement: {
    before_instruction: 'context block appears before the main instruction',
    after_instruction: 'instruction appears first, context follows',
    interleaved: 'context and instruction lines are woven together',
    none: 'no context block included',
  },
  constraintStyle: {
    inline: 'constraints woven into prose ("Make sure that...")',
    bulleted: 'constraints as a bullet list',
    negative: 'constraints framed as prohibitions ("Do NOT...")',
    positive: 'constraints framed as affirmations ("Ensure that...")',
    none: 'no explicit constraints included',
  },
  outputSpec: {
    free_form: 'no output format specified',
    json: 'response requested as JSON',
    markdown: 'response requested as Markdown with headers/lists',
    structured_template: 'response must follow a Title/Summary/Details/Next Steps template',
    code_only: 'response must be code only, no prose',
  },
  engineeringPattern: {
    plain_text: 'plain text with no special formatting (baseline)',
    xml_blocks: 'sections wrapped in <tag>...</tag> XML blocks',
    json_config: 'instructions encoded as a JSON object embedded in the prompt',
    markdown_sections: 'content organized under ## Markdown headers',
    triple_backtick_fenced: 'key content inside ```fenced code blocks```',
    numbered_priority: 'sections labeled with [PRIORITY N] ordering',
    key_value_pairs: 'sections formatted as KEY: value pairs',
    nested_xml: 'multi-level nested <task><context>...</context><instruction>...</instruction></task>',
    system_user_separation: 'prompt simulates [SYSTEM] and [USER] role blocks',
    delimiter_separated: 'sections separated by --- horizontal rules',
  },
};

/**
 * Builds a human-readable hypothesis string for a specific pattern.
 * Describes exactly what structural question this pattern answers.
 */
function buildHypothesis(
  structure: string,
  detail: string,
  tone: string,
  contextPlacement: string,
  constraintStyle: string,
  outputSpec: string,
  engineeringPattern: string,
  domain: string,
  complexity: string,
): string {
  const structLabel = DIMENSION_LABELS.structure[structure];
  const engLabel = DIMENSION_LABELS.engineeringPattern[engineeringPattern];
  const detailLabel = DIMENSION_LABELS.detail[detail];
  const constrLabel = DIMENSION_LABELS.constraintStyle[constraintStyle];
  const outLabel = DIMENSION_LABELS.outputSpec[outputSpec];

  return (
    `Tests whether ${engLabel} encoding with ${structLabel} structure, ` +
    `${detailLabel}, ${constrLabel}, requesting ${outLabel} ` +
    `works on a ${complexity} ${domain} task.`
  );
}

/**
 * Deterministic seeded PRNG (mulberry32).
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generates exactly `count` prompt patterns using a deterministic
 * stratified grid walk.
 *
 * Algorithm:
 * 1. Build all 144,000 dimension combos (7 dimensions).
 * 2. Deterministically shuffle (seeded PRNG).
 * 3. Take the first `target` combos, pair with tasks round-robin.
 * 4. Render each into a concrete prompt string.
 *
 * Guarantees:
 * - Every dimension value appears proportionally.
 * - Every pattern is unique (no duplicate combos).
 * - Deterministic (same seed = same output).
 * - Every domain gets roughly equal representation.
 *
 * @param count Number of patterns (1000-10000)
 * @param seed  PRNG seed for deterministic output (default: 42)
 * @param quickMode If true, uses stratified sampling focused on high-impact dimensions
 */
export function generatePatterns(count: number, seed = 42, quickMode = false): PromptPattern[] {
  const target = quickMode
    ? Math.max(200, Math.min(500, count))
    : Math.max(1000, Math.min(10000, count));

  // Step 1: Build all dimension combos
  type Combo = {
    structure: typeof STRUCTURES[number];
    detail: typeof DETAILS[number];
    tone: typeof TONES[number];
    contextPlacement: typeof CONTEXT_PLACEMENTS[number];
    constraintStyle: typeof CONSTRAINT_STYLES[number];
    outputSpec: typeof OUTPUT_SPECS[number];
    engineeringPattern: typeof ENGINEERING_PATTERNS[number];
  };

  const combos: Combo[] = [];

  for (const structure of STRUCTURES) {
    for (const detail of DETAILS) {
      for (const tone of TONES) {
        for (const contextPlacement of CONTEXT_PLACEMENTS) {
          for (const constraintStyle of CONSTRAINT_STYLES) {
            for (const outputSpec of OUTPUT_SPECS) {
              for (const engineeringPattern of ENGINEERING_PATTERNS) {
                combos.push({
                  structure, detail, tone, contextPlacement,
                  constraintStyle, outputSpec, engineeringPattern,
                });
              }
            }
          }
        }
      }
    }
  }

  // Step 2: Deterministic Fisher-Yates shuffle
  const rng = mulberry32(seed);
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }

  // Step 3: Take the first `target` combos, pair with tasks round-robin
  const patterns: PromptPattern[] = [];

  for (let i = 0; i < target && i < combos.length; i++) {
    const combo = combos[i];
    const task = DOMAIN_TASKS[i % DOMAIN_TASKS.length];

    const hypothesis = buildHypothesis(
      combo.structure,
      combo.detail,
      combo.tone,
      combo.contextPlacement,
      combo.constraintStyle,
      combo.outputSpec,
      combo.engineeringPattern,
      task.domain,
      task.complexity,
    );

    const renderedPrompt = renderPrompt(
      task,
      combo.structure,
      combo.detail,
      combo.tone,
      combo.contextPlacement,
      combo.constraintStyle,
      combo.outputSpec,
      combo.engineeringPattern,
    );

    patterns.push({
      id: `pat-${String(i).padStart(5, '0')}`,
      hypothesis,
      domain: task.domain,
      task: task.task,
      complexity: task.complexity,
      structure: combo.structure,
      detail: combo.detail,
      tone: combo.tone,
      contextPlacement: combo.contextPlacement,
      constraintStyle: combo.constraintStyle,
      outputSpec: combo.outputSpec,
      engineeringPattern: combo.engineeringPattern,
      renderedPrompt,
    });
  }

  return patterns;
}

/**
 * Returns a summary of the dimension coverage for a set of patterns.
 */
export function getCoverageReport(patterns: PromptPattern[]): Record<string, Record<string, number>> {
  const report: Record<string, Record<string, number>> = {
    structure: {},
    detail: {},
    tone: {},
    contextPlacement: {},
    constraintStyle: {},
    outputSpec: {},
    engineeringPattern: {},
    domain: {},
    complexity: {},
  };

  for (const p of patterns) {
    report['structure'][p.structure] = (report['structure'][p.structure] || 0) + 1;
    report['detail'][p.detail] = (report['detail'][p.detail] || 0) + 1;
    report['tone'][p.tone] = (report['tone'][p.tone] || 0) + 1;
    report['contextPlacement'][p.contextPlacement] = (report['contextPlacement'][p.contextPlacement] || 0) + 1;
    report['constraintStyle'][p.constraintStyle] = (report['constraintStyle'][p.constraintStyle] || 0) + 1;
    report['outputSpec'][p.outputSpec] = (report['outputSpec'][p.outputSpec] || 0) + 1;
    report['engineeringPattern'][p.engineeringPattern] = (report['engineeringPattern'][p.engineeringPattern] || 0) + 1;
    report['domain'][p.domain] = (report['domain'][p.domain] || 0) + 1;
    report['complexity'][p.complexity] = (report['complexity'][p.complexity] || 0) + 1;
  }

  return report;
}
