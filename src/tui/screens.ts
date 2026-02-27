import * as p from '@clack/prompts';
import chalk from 'chalk';
import Table from 'cli-table3';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig } from '../utils/config.js';
import { generatePatterns, getCoverageReport, getFullCombinatorialSize } from '../generators/pattern-generator.js';
import { OpenRouterClient } from '../openrouter/client.js';
import { ModelDiscovery } from '../openrouter/model-discovery.js';
import { EvaluationEngine } from '../evaluator/engine.js';
import { RuleSetExtractor } from '../ruleset/extractor.js';
import { PromptRewriter } from '../rewriter/rewriter.js';
import type { PromptPattern, EvaluationResult, RuleSet, Config } from '../types/index.js';
import {
  banner, sectionHeader, keyValue, successMsg, errorMsg,
  progressBar, scoreBar, divider,
} from './render.js';

// ── Generate Patterns Screen ───────────────────────────────────────

export async function screenGenerate(config: Config) {
  sectionHeader('Generate Prompt Patterns');

  const countInput = await p.text({
    message: 'How many patterns to generate?',
    placeholder: '1000',
    defaultValue: '1000',
    validate: (v) => {
      const n = parseInt(v ?? '', 10);
      if (isNaN(n) || n < 100 || n > 10000) return 'Enter a number between 100 and 10000';
      return undefined;
    },
  });
  if (p.isCancel(countInput)) return;

  const count = parseInt(String(countInput), 10);
  const fullSize = getFullCombinatorialSize();

  keyValue('Full combinatorial space', fullSize.toLocaleString());
  keyValue('Sampling', `${count} patterns`);

  const s = p.spinner();
  s.start('Generating patterns...');

  const patterns = generatePatterns(count);
  const coverage = getCoverageReport(patterns);

  const patternsDir = join(config.outputDir, 'patterns');
  await mkdir(patternsDir, { recursive: true });
  await writeFile(join(patternsDir, 'patterns.json'), JSON.stringify(patterns, null, 2));

  s.stop(`Generated ${patterns.length} patterns`);

  // Show coverage table
  sectionHeader('Dimension Coverage');
  for (const [dim, counts] of Object.entries(coverage)) {
    const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
    console.log(`  ${chalk.bold.cyan(dim)}`);

    const table = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { head: ['cyan'], 'padding-left': 4 },
    });
    for (const [val, cnt] of entries) {
      const barWidth = Math.round((cnt / count) * 30);
      table.push([
        chalk.white(val),
        chalk.green('█'.repeat(barWidth)) + chalk.dim('░'.repeat(30 - barWidth)),
        chalk.dim(`${cnt} (${Math.round((cnt / count) * 100)}%)`),
      ]);
    }
    console.log(table.toString());
    console.log('');
  }

  successMsg(`Patterns saved to ${patternsDir}/patterns.json`);
}

// ── Select Model Screen ────────────────────────────────────────────

export async function screenSelectModel(config: Config): Promise<string | null> {
  sectionHeader('Select a Model');

  const client = new OpenRouterClient(config.openRouterApiKey);
  const discovery = new ModelDiscovery(client, config.outputDir);

  const s = p.spinner();
  s.start('Fetching models from OpenRouter...');

  let models;
  try {
    models = await discovery.getModels(config.modelFilter);
  } catch (err) {
    s.stop('Failed to fetch models');
    errorMsg((err as Error).message);
    return null;
  }

  s.stop(`Found ${models.length} models`);

  // Show top models to pick from
  const topModels = models.slice(0, 30);
  const choices = topModels.map(m => ({
    value: m.id,
    label: `${m.id} — ${m.name} (ctx: ${m.context_length})`,
  }));

  const selected = await p.select({
    message: 'Choose a model to evaluate:',
    options: choices,
  });

  if (p.isCancel(selected)) return null;
  return selected as string;
}

// ── Evaluate Model Screen ──────────────────────────────────────────

export async function screenEvaluate(config: Config) {
  sectionHeader('Evaluate Model');

  // Load patterns
  const patternsPath = join(config.outputDir, 'patterns', 'patterns.json');
  let patterns: PromptPattern[];
  try {
    patterns = JSON.parse(await readFile(patternsPath, 'utf-8'));
  } catch {
    errorMsg('No patterns found. Generate patterns first.');
    return;
  }

  keyValue('Patterns loaded', patterns.length);

  // Select model
  const modelId = await screenSelectModel(config);
  if (!modelId) return;

  // How many patterns to evaluate?
  const subsetInput = await p.text({
    message: `Evaluate how many patterns? (max ${patterns.length})`,
    placeholder: String(Math.min(100, patterns.length)),
    defaultValue: String(Math.min(100, patterns.length)),
    validate: (v) => {
      const n = parseInt(v ?? '', 10);
      if (isNaN(n) || n < 1 || n > patterns.length) return `Enter 1-${patterns.length}`;
      return undefined;
    },
  });
  if (p.isCancel(subsetInput)) return;

  const subsetCount = parseInt(subsetInput as string, 10);
  const subset = patterns.slice(0, subsetCount);

  // Judge model
  const judgeModel = await p.text({
    message: 'Judge model (scores the responses):',
    placeholder: 'openai/gpt-4o-mini',
    defaultValue: 'openai/gpt-4o-mini',
  });
  if (p.isCancel(judgeModel)) return;

  sectionHeader(`Running Evaluation: ${modelId}`);
  keyValue('Patterns', subsetCount);
  keyValue('Concurrency', config.concurrencyLimit);
  keyValue('Judge', judgeModel as string);
  console.log('');

  const client = new OpenRouterClient(config.openRouterApiKey);
  const engine = new EvaluationEngine(client, config, judgeModel as string);

  let lastPrint = 0;
  const results = await engine.evaluateModel(modelId, subset, (progress) => {
    const now = Date.now();
    if (now - lastPrint > 500 || progress.completed === progress.total) {
      process.stdout.write('\r' + progressBar(progress.completed, progress.total));
      if (progress.errors > 0) {
        process.stdout.write(chalk.red(` ${progress.errors} errors`));
      }
      if (progress.completed === progress.total) {
        process.stdout.write('\n');
      }
      lastPrint = now;
    }
  });

  console.log('');
  successMsg(`Completed ${results.length} evaluations`);

  // Quick summary
  if (results.length > 0) {
    showResultsSummary(results, modelId);
  }

  const doExtract = await p.confirm({
    message: 'Extract rule set from these results?',
  });
  if (!p.isCancel(doExtract) && doExtract) {
    await extractAndShow(config, modelId, patterns, results);
  }
}

// ── View Results Screen ────────────────────────────────────────────

export async function screenViewResults(config: Config) {
  sectionHeader('View Results');

  const evalDir = join(config.outputDir, 'evaluations');
  let dirs: string[];
  try {
    dirs = await readdir(evalDir);
  } catch {
    errorMsg('No evaluations found. Run an evaluation first.');
    return;
  }

  if (dirs.length === 0) {
    errorMsg('No evaluations found.');
    return;
  }

  const selected = await p.select({
    message: 'Select a model to view:',
    options: dirs.map(d => ({
      value: d,
      label: d.replace(/_/g, '/'),
    })),
  });
  if (p.isCancel(selected)) return;

  const modelDir = selected as string;
  const resultsPath = join(evalDir, modelDir, 'results.json');
  let results: EvaluationResult[];
  try {
    results = JSON.parse(await readFile(resultsPath, 'utf-8'));
  } catch {
    errorMsg('Could not load results.');
    return;
  }

  const modelId = modelDir.replace(/_/g, '/');
  showResultsSummary(results, modelId);

  // Load patterns for dimension analysis
  const patternsPath = join(config.outputDir, 'patterns', 'patterns.json');
  let patterns: PromptPattern[];
  try {
    patterns = JSON.parse(await readFile(patternsPath, 'utf-8'));
  } catch {
    return;
  }

  await showDimensionBreakdown(patterns, results);

  const doExtract = await p.confirm({
    message: 'Extract rule set from these results?',
  });
  if (!p.isCancel(doExtract) && doExtract) {
    await extractAndShow(config, modelId, patterns, results);
  }
}

// ── View Rule Set Screen ───────────────────────────────────────────

export async function screenViewRuleSet(config: Config) {
  sectionHeader('View Rule Set');

  const ruleSetDir = join(config.outputDir, 'rulesets');
  let files: string[];
  try {
    files = (await readdir(ruleSetDir)).filter(f => f.endsWith('.json'));
  } catch {
    errorMsg('No rule sets found. Run an evaluation and extract first.');
    return;
  }

  if (files.length === 0) {
    errorMsg('No rule sets found.');
    return;
  }

  const selected = await p.select({
    message: 'Select a rule set to view:',
    options: files.map(f => ({
      value: f,
      label: f.replace(/_/g, '/').replace('.json', ''),
    })),
  });
  if (p.isCancel(selected)) return;

  const ruleSet: RuleSet = JSON.parse(
    await readFile(join(ruleSetDir, selected as string), 'utf-8'),
  );

  showRuleSet(ruleSet);
}

// ── Rewrite Screen ─────────────────────────────────────────────────

export async function screenRewrite(config: Config) {
  sectionHeader('Rewrite a Prompt');

  const ruleSetDir = join(config.outputDir, 'rulesets');
  let files: string[];
  try {
    files = (await readdir(ruleSetDir)).filter(f => f.endsWith('.json'));
  } catch {
    errorMsg('No rule sets found. Run an evaluation and extract first.');
    return;
  }

  if (files.length === 0) {
    errorMsg('No rule sets found.');
    return;
  }

  const selectedFile = await p.select({
    message: 'Select rule set to apply:',
    options: files.map(f => ({
      value: f,
      label: f.replace(/_/g, '/').replace('.json', ''),
    })),
  });
  if (p.isCancel(selectedFile)) return;

  const ruleSet: RuleSet = JSON.parse(
    await readFile(join(ruleSetDir, selectedFile as string), 'utf-8'),
  );

  const inputPrompt = await p.text({
    message: 'Enter the prompt you want to optimize:',
    placeholder: 'Write a function that...',
  });
  if (p.isCancel(inputPrompt)) return;

  const mode = await p.select({
    message: 'Rewrite mode:',
    options: [
      { value: 'llm', label: 'LLM-assisted (best quality, uses API)' },
      { value: 'offline', label: 'Template-based (instant, no API call)' },
    ],
  });
  if (p.isCancel(mode)) return;

  const client = mode === 'llm' ? new OpenRouterClient(config.openRouterApiKey) : undefined;
  const rewriter = new PromptRewriter(client);

  const s = p.spinner();
  s.start('Rewriting prompt...');

  let rewritten: string;
  if (mode === 'llm') {
    rewritten = await rewriter.rewriteWithLLM(inputPrompt as string, ruleSet);
  } else {
    rewritten = rewriter.rewriteWithTemplate(inputPrompt as string, ruleSet);
  }

  s.stop('Done');

  sectionHeader('Original');
  console.log(chalk.dim('  ' + (inputPrompt as string).split('\n').join('\n  ')));

  sectionHeader('Optimized');
  console.log(chalk.green('  ' + rewritten.split('\n').join('\n  ')));
  console.log('');
}

// ── Full Pipeline Screen ───────────────────────────────────────────

export async function screenFullPipeline(config: Config) {
  sectionHeader('Full Pipeline');

  const modelId = await screenSelectModel(config);
  if (!modelId) return;

  const countInput = await p.text({
    message: 'Number of patterns:',
    placeholder: '1000',
    defaultValue: '1000',
  });
  if (p.isCancel(countInput)) return;

  const count = parseInt(countInput as string, 10);

  // Step 1: Generate
  p.log.step(chalk.bold('Step 1/3: Generate Patterns'));
  const s1 = p.spinner();
  s1.start(`Generating ${count} patterns...`);
  const patterns = generatePatterns(count);
  const patternsDir = join(config.outputDir, 'patterns');
  await mkdir(patternsDir, { recursive: true });
  await writeFile(join(patternsDir, 'patterns.json'), JSON.stringify(patterns, null, 2));
  s1.stop(`Generated ${patterns.length} patterns`);

  // Step 2: Evaluate
  p.log.step(chalk.bold(`Step 2/3: Evaluate against ${modelId}`));

  const client = new OpenRouterClient(config.openRouterApiKey);
  const engine = new EvaluationEngine(client, config);

  let lastPrint = 0;
  const results = await engine.evaluateModel(modelId, patterns, (progress) => {
    const now = Date.now();
    if (now - lastPrint > 500 || progress.completed === progress.total) {
      process.stdout.write('\r' + progressBar(progress.completed, progress.total));
      if (progress.errors > 0) {
        process.stdout.write(chalk.red(` ${progress.errors} err`));
      }
      if (progress.completed === progress.total) {
        process.stdout.write('\n');
      }
      lastPrint = now;
    }
  });

  console.log('');
  successMsg(`${results.length} evaluations complete`);

  // Step 3: Extract
  p.log.step(chalk.bold('Step 3/3: Extract Rule Set'));
  await extractAndShow(config, modelId, patterns, results);

  p.outro(chalk.green.bold('Pipeline complete!'));
}

// ── Inspect Patterns Screen ────────────────────────────────────────

export async function screenInspectPatterns(config: Config) {
  sectionHeader('Inspect Patterns');

  const patternsPath = join(config.outputDir, 'patterns', 'patterns.json');
  let patterns: PromptPattern[];
  try {
    patterns = JSON.parse(await readFile(patternsPath, 'utf-8'));
  } catch {
    // Try the committed fixture
    try {
      patterns = JSON.parse(await readFile('patterns/all-1000-patterns.json', 'utf-8'));
    } catch {
      errorMsg('No patterns found. Generate some first.');
      return;
    }
  }

  keyValue('Total patterns', patterns.length);

  const action = await p.select({
    message: 'What do you want to inspect?',
    options: [
      { value: 'browse', label: 'Browse patterns by ID' },
      { value: 'filter_eng', label: 'Filter by engineering pattern' },
      { value: 'filter_struct', label: 'Filter by structure style' },
      { value: 'filter_domain', label: 'Filter by domain' },
      { value: 'random', label: 'Show 5 random patterns' },
    ],
  });
  if (p.isCancel(action)) return;

  let selected: PromptPattern[] = [];

  if (action === 'browse') {
    const idInput = await p.text({
      message: 'Enter pattern ID (e.g., pat-00042) or index (e.g., 42):',
      placeholder: '0',
    });
    if (p.isCancel(idInput)) return;
    const input = idInput as string;
    const idx = input.startsWith('pat-')
      ? parseInt(input.replace('pat-', ''), 10)
      : parseInt(input, 10);
    if (patterns[idx]) {
      selected = [patterns[idx]];
    } else {
      errorMsg('Pattern not found');
      return;
    }
  } else if (action === 'filter_eng') {
    const engTypes = [...new Set(patterns.map(p => p.engineeringPattern))];
    const pick = await p.select({
      message: 'Engineering pattern:',
      options: engTypes.map(e => ({ value: e, label: e })),
    });
    if (p.isCancel(pick)) return;
    selected = patterns.filter(p => p.engineeringPattern === pick).slice(0, 5);
  } else if (action === 'filter_struct') {
    const structTypes = [...new Set(patterns.map(p => p.structure))];
    const pick = await p.select({
      message: 'Structure style:',
      options: structTypes.map(s => ({ value: s, label: s })),
    });
    if (p.isCancel(pick)) return;
    selected = patterns.filter(p => p.structure === pick).slice(0, 5);
  } else if (action === 'filter_domain') {
    const domains = [...new Set(patterns.map(p => p.domain))];
    const pick = await p.select({
      message: 'Domain:',
      options: domains.map(d => ({ value: d, label: d })),
    });
    if (p.isCancel(pick)) return;
    selected = patterns.filter(p => p.domain === pick).slice(0, 5);
  } else if (action === 'random') {
    const indices = new Set<number>();
    while (indices.size < 5) {
      indices.add(Math.floor(Math.random() * patterns.length));
    }
    selected = [...indices].map(i => patterns[i]);
  }

  for (const pat of selected) {
    showPattern(pat);
  }
}

// ── Internal display helpers ───────────────────────────────────────

function showPattern(pat: PromptPattern) {
  divider();
  console.log(`  ${chalk.bold.cyan(pat.id)} ${chalk.dim('|')} ${chalk.white(pat.domain)} ${chalk.dim('|')} ${chalk.yellow(pat.complexity)}`);
  console.log(`  ${chalk.dim('Task:')} ${pat.task}`);
  console.log(`  ${chalk.dim('Structure:')} ${pat.structure}  ${chalk.dim('Detail:')} ${pat.detail}  ${chalk.dim('Tone:')} ${pat.tone}`);
  console.log(`  ${chalk.dim('Context:')} ${pat.contextPlacement}  ${chalk.dim('Constraints:')} ${pat.constraintStyle}  ${chalk.dim('Output:')} ${pat.outputSpec}`);
  console.log(`  ${chalk.dim('Engineering:')} ${chalk.magenta(pat.engineeringPattern)}`);
  console.log(`  ${chalk.dim('Hypothesis:')} ${chalk.italic(pat.hypothesis)}`);
  console.log('');
  console.log(chalk.dim('  ┌─ Rendered Prompt ─────────────────────────────────'));
  const lines = pat.renderedPrompt.split('\n');
  for (const line of lines) {
    console.log(chalk.dim('  │ ') + chalk.white(line));
  }
  console.log(chalk.dim('  └──────────────────────────────────────────────────'));
  console.log('');
}

function showResultsSummary(results: EvaluationResult[], modelId: string) {
  sectionHeader(`Results Summary: ${modelId}`);

  const avgOverall = avg(results.map(r => r.scores.overall));
  const avgAdherence = avg(results.map(r => r.scores.instruction_adherence));
  const avgFormat = avg(results.map(r => r.scores.format_compliance));
  const avgComplete = avg(results.map(r => r.scores.completeness));
  const avgClarity = avg(results.map(r => r.scores.clarity));
  const avgNoHalluc = avg(results.map(r => r.scores.no_hallucination));
  const avgLatency = avg(results.map(r => r.latencyMs));
  const totalTokens = results.reduce((a, r) => a + r.tokenUsage.prompt + r.tokenUsage.completion, 0);

  const table = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Score'), chalk.cyan('Bar')],
    chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    colWidths: [25, 10, 30],
    style: { 'padding-left': 2 },
  });

  table.push(
    ['Overall', avgOverall.toFixed(3), scoreBar(avgOverall)],
    ['Instruction Adherence', avgAdherence.toFixed(3), scoreBar(avgAdherence)],
    ['Format Compliance', avgFormat.toFixed(3), scoreBar(avgFormat)],
    ['Completeness', avgComplete.toFixed(3), scoreBar(avgComplete)],
    ['Clarity', avgClarity.toFixed(3), scoreBar(avgClarity)],
    ['No Hallucination', avgNoHalluc.toFixed(3), scoreBar(avgNoHalluc)],
  );

  console.log(table.toString());
  console.log('');
  keyValue('Avg latency', `${Math.round(avgLatency)}ms`);
  keyValue('Total tokens', totalTokens.toLocaleString());
  keyValue('Evaluations', results.length);
}

async function showDimensionBreakdown(
  patterns: PromptPattern[],
  results: EvaluationResult[],
) {
  const extractor = new RuleSetExtractor();
  const stats = extractor.computeStats(patterns, results);

  // Group by dimension
  const byDim = new Map<string, typeof stats>();
  for (const s of stats) {
    if (!byDim.has(s.dimension)) byDim.set(s.dimension, []);
    byDim.get(s.dimension)!.push(s);
  }

  for (const [dim, dimStats] of byDim) {
    sectionHeader(`Dimension: ${dim}`);
    const sorted = [...dimStats].sort((a, b) => b.meanOverall - a.meanOverall);

    const table = new Table({
      head: [chalk.cyan('Value'), chalk.cyan('Score'), chalk.cyan('Bar'), chalk.cyan('n'), chalk.cyan('σ')],
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 2 },
    });

    for (const s of sorted) {
      table.push([
        s.value,
        s.meanOverall.toFixed(3),
        scoreBar(s.meanOverall, 15),
        s.sampleSize,
        s.stdDevOverall.toFixed(3),
      ]);
    }

    console.log(table.toString());
  }
}

async function extractAndShow(
  config: Config,
  modelId: string,
  patterns: PromptPattern[],
  results: EvaluationResult[],
) {
  const s = p.spinner();
  s.start('Extracting rule set...');

  const extractor = new RuleSetExtractor();
  const ruleSet = extractor.buildRuleSet(modelId, modelId, patterns, results);

  const modelDir = modelId.replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  const ruleSetDir = join(config.outputDir, 'rulesets');
  await mkdir(ruleSetDir, { recursive: true });
  await writeFile(join(ruleSetDir, `${modelDir}.json`), JSON.stringify(ruleSet, null, 2));
  await writeFile(join(ruleSetDir, `${modelDir}_meta-prompt.md`), ruleSet.metaPrompt);
  await writeFile(join(ruleSetDir, `${modelDir}_rewrite-instructions.md`), ruleSet.rewriteInstructions);

  s.stop('Rule set extracted');
  showRuleSet(ruleSet);

  successMsg(`Saved to ${ruleSetDir}/${modelDir}.json`);
}

function showRuleSet(ruleSet: RuleSet) {
  sectionHeader(`Rule Set: ${ruleSet.modelName}`);

  keyValue('Patterns tested', ruleSet.patternsTested);
  keyValue('Generated at', ruleSet.generatedAt);
  keyValue('Rules', ruleSet.rules.length);
  console.log('');

  const table = new Table({
    head: [
      chalk.cyan('Dimension'),
      chalk.cyan('Confidence'),
      chalk.cyan('Prefer'),
      chalk.cyan('Avoid'),
    ],
    chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    colWidths: [20, 14, 30, 25],
    wordWrap: true,
    style: { 'padding-left': 2 },
  });

  for (const rule of ruleSet.rules) {
    table.push([
      chalk.bold(rule.dimension),
      scoreBar(rule.confidence, 8),
      chalk.green(rule.preferredValues.join(', ')),
      rule.avoidValues.length > 0 ? chalk.red(rule.avoidValues.join(', ')) : chalk.dim('—'),
    ]);
  }

  console.log(table.toString());

  sectionHeader('Meta-Prompt (use as system prompt)');
  const lines = ruleSet.metaPrompt.split('\n');
  for (const line of lines) {
    console.log(chalk.dim('  │ ') + chalk.white(line));
  }

  sectionHeader('Rewrite Instructions');
  const rwLines = ruleSet.rewriteInstructions.split('\n').slice(0, 20);
  for (const line of rwLines) {
    console.log(chalk.dim('  │ ') + chalk.white(line));
  }
  if (ruleSet.rewriteInstructions.split('\n').length > 20) {
    console.log(chalk.dim('  │ ... (truncated, see full file)'));
  }
  console.log('');
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
