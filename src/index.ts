#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './utils/config.js';
import { log } from './utils/logger.js';
import { generatePatterns, getCoverageReport, getFullCombinatorialSize } from './generators/pattern-generator.js';
import { OpenRouterClient } from './openrouter/client.js';
import { ModelDiscovery } from './openrouter/model-discovery.js';
import { EvaluationEngine } from './evaluator/engine.js';
import { RuleSetExtractor } from './ruleset/extractor.js';
import { PromptRewriter } from './rewriter/rewriter.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const program = new Command();

program
  .name('prompt-optimizer')
  .description(
    'Empirical prompt structure optimizer.\n' +
    'Discovers the optimal prompt rule set for any LLM by testing\n' +
    '1,000-10,000 prompt patterns across structural dimensions\n' +
    'via OpenRouter.',
  )
  .version('1.0.0');

// ── Generate Command ───────────────────────────────────────────────────

program
  .command('generate')
  .description('Generate prompt patterns (1K-10K) for evaluation')
  .option('-n, --count <number>', 'Number of patterns to generate', '1000')
  .option('-o, --output <path>', 'Output file path')
  .action(async (opts) => {
    const count = parseInt(opts.count, 10);
    log.info(`Full combinatorial space: ${getFullCombinatorialSize().toLocaleString()} patterns`);
    log.info(`Generating ${count} stratified samples...`);

    const patterns = generatePatterns(count);

    const config = loadConfig();
    const outputDir = opts.output ? opts.output : join(config.outputDir, 'patterns');
    await mkdir(outputDir, { recursive: true });

    const outputPath = join(outputDir, 'patterns.json');
    await writeFile(outputPath, JSON.stringify(patterns, null, 2));
    log.success(`Generated ${patterns.length} patterns -> ${outputPath}`);

    // Coverage report
    const coverage = getCoverageReport(patterns);
    log.info('\nDimension coverage:');
    for (const [dim, counts] of Object.entries(coverage)) {
      const entries = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .map(([val, cnt]) => `${val}=${cnt}`)
        .join(', ');
      log.info(`  ${dim}: ${entries}`);
    }
  });

// ── Discover Models Command ────────────────────────────────────────────

program
  .command('discover-models')
  .description('List available models from OpenRouter')
  .option('--new-only', 'Show only models without existing rule sets')
  .action(async (opts) => {
    const config = loadConfig();
    const client = new OpenRouterClient(config.openRouterApiKey);
    const discovery = new ModelDiscovery(client, config.outputDir);

    log.info('Fetching models from OpenRouter...');

    const models = opts.newOnly
      ? await discovery.getNewModels(config.modelFilter)
      : await discovery.getModels(config.modelFilter);

    log.success(`Found ${models.length} models${opts.newOnly ? ' (without rule sets)' : ''}:\n`);

    for (const m of models.slice(0, 50)) {
      log.info(`  ${m.id} — ${m.name} (ctx: ${m.context_length})`);
    }

    if (models.length > 50) {
      log.info(`  ... and ${models.length - 50} more`);
    }
  });

// ── Evaluate Command ───────────────────────────────────────────────────

program
  .command('evaluate')
  .description('Run prompt patterns against a model and score responses')
  .requiredOption('-m, --model <id>', 'OpenRouter model ID (e.g., openai/gpt-4o)')
  .option('-p, --patterns <path>', 'Path to patterns JSON file')
  .option('-j, --judge <model>', 'Judge model for scoring', 'openai/gpt-4o-mini')
  .option('-n, --count <number>', 'Number of patterns to evaluate (subset)', '')
  .action(async (opts) => {
    const config = loadConfig();
    const client = new OpenRouterClient(config.openRouterApiKey);

    // Load patterns
    const patternsPath = opts.patterns ?? join(config.outputDir, 'patterns', 'patterns.json');
    let patterns;
    try {
      const raw = await readFile(patternsPath, 'utf-8');
      patterns = JSON.parse(raw);
    } catch {
      log.error(`No patterns found at ${patternsPath}. Run 'generate' first.`);
      process.exit(1);
    }

    // Optionally subset
    if (opts.count) {
      const n = parseInt(opts.count, 10);
      patterns = patterns.slice(0, n);
    }

    log.info(`Evaluating ${patterns.length} patterns against ${opts.model}...`);
    log.info(`Judge model: ${opts.judge}`);
    log.info(`Concurrency: ${config.concurrencyLimit}`);

    const engine = new EvaluationEngine(client, config, opts.judge);
    const results = await engine.evaluateModel(opts.model, patterns, (progress) => {
      log.progress(progress.completed, progress.total, `${progress.currentPattern} (${progress.errors} errors)`);
    });

    log.success(`\nCompleted ${results.length} evaluations for ${opts.model}`);

    // Quick summary
    const avgOverall = results.reduce((a, r) => a + r.scores.overall, 0) / results.length;
    log.info(`Average overall score: ${avgOverall.toFixed(3)}`);
  });

// ── Extract Command ────────────────────────────────────────────────────

program
  .command('extract')
  .description('Extract a rule set from evaluation results')
  .requiredOption('-m, --model <id>', 'OpenRouter model ID')
  .option('-p, --patterns <path>', 'Path to patterns JSON file')
  .option('-e, --evaluations <path>', 'Path to evaluations JSON file')
  .action(async (opts) => {
    const config = loadConfig();

    // Load patterns
    const patternsPath = opts.patterns ?? join(config.outputDir, 'patterns', 'patterns.json');
    const patterns = JSON.parse(await readFile(patternsPath, 'utf-8'));

    // Load evaluations
    const modelDir = opts.model.replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    const evalPath = opts.evaluations ?? join(config.outputDir, 'evaluations', modelDir, 'results.json');
    const results = JSON.parse(await readFile(evalPath, 'utf-8'));

    log.info(`Extracting rule set from ${results.length} evaluations for ${opts.model}...`);

    const extractor = new RuleSetExtractor();
    const ruleSet = extractor.buildRuleSet(opts.model, opts.model, patterns, results);

    // Save rule set
    const ruleSetDir = join(config.outputDir, 'rulesets');
    await mkdir(ruleSetDir, { recursive: true });
    const ruleSetPath = join(ruleSetDir, `${modelDir}.json`);
    await writeFile(ruleSetPath, JSON.stringify(ruleSet, null, 2));
    log.success(`Rule set saved -> ${ruleSetPath}`);

    // Also save human-readable versions
    await writeFile(
      join(ruleSetDir, `${modelDir}_meta-prompt.md`),
      ruleSet.metaPrompt,
    );
    await writeFile(
      join(ruleSetDir, `${modelDir}_rewrite-instructions.md`),
      ruleSet.rewriteInstructions,
    );

    // Display rules
    log.info('\nExtracted Rules:');
    for (const rule of ruleSet.rules) {
      log.info(`\n  [${rule.dimension}] (confidence: ${rule.confidence})`);
      log.info(`    ${rule.recommendation}`);
    }
  });

// ── Rewrite Command ────────────────────────────────────────────────────

program
  .command('rewrite')
  .description('Rewrite a prompt using a model\'s rule set')
  .requiredOption('-m, --model <id>', 'OpenRouter model ID (to load its rule set)')
  .requiredOption('-i, --input <text>', 'The prompt text to rewrite')
  .option('--offline', 'Use template-based rewriting (no API call)')
  .action(async (opts) => {
    const config = loadConfig();
    const client = new OpenRouterClient(config.openRouterApiKey);

    // Load rule set
    const modelDir = opts.model.replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    const ruleSetPath = join(config.outputDir, 'rulesets', `${modelDir}.json`);
    let ruleSet;
    try {
      ruleSet = JSON.parse(await readFile(ruleSetPath, 'utf-8'));
    } catch {
      log.error(`No rule set found for ${opts.model}. Run 'evaluate' then 'extract' first.`);
      process.exit(1);
    }

    const rewriter = new PromptRewriter(
      opts.offline ? undefined : client,
    );

    log.info(`Rewriting prompt for ${opts.model}...`);

    const rewritten = opts.offline
      ? rewriter.rewriteWithTemplate(opts.input, ruleSet)
      : await rewriter.rewriteWithLLM(opts.input, ruleSet);

    log.info('\n--- Original ---');
    log.info(opts.input);
    log.info('\n--- Rewritten ---');
    log.info(rewritten);
  });

// ── Full Pipeline Command ──────────────────────────────────────────────

program
  .command('full-pipeline')
  .description('Run the complete pipeline: generate -> evaluate -> extract for a model')
  .requiredOption('-m, --model <id>', 'OpenRouter model ID')
  .option('-n, --count <number>', 'Number of patterns', '1000')
  .option('-j, --judge <model>', 'Judge model', 'openai/gpt-4o-mini')
  .option('--quick', 'Quick mode: optimize for 200-350 patterns with focused sampling')
  .action(async (opts) => {
    const config = loadConfig();
    const client = new OpenRouterClient(config.openRouterApiKey);
    let count = parseInt(opts.count, 10);

    // Override count if quick mode is enabled
    if (opts.quick) {
      count = Math.min(count, 350);
      log.info('[QUICK MODE] Optimizing pattern count and sampling strategy');
    }

    // Step 1: Generate
    log.info('=== Step 1/3: Generating patterns ===');
    const patterns = generatePatterns(count, undefined, opts.quick);
    const patternsDir = join(config.outputDir, 'patterns');
    await mkdir(patternsDir, { recursive: true });
    await writeFile(join(patternsDir, 'patterns.json'), JSON.stringify(patterns, null, 2));
    log.success(`Generated ${patterns.length} patterns`);

    // Step 2: Evaluate
    log.info(`\n=== Step 2/3: Evaluating against ${opts.model} ===`);
    const engine = new EvaluationEngine(client, config, opts.judge);
    const results = await engine.evaluateModel(opts.model, patterns, (progress) => {
      log.progress(progress.completed, progress.total, `${progress.currentPattern} (${progress.errors} errors)`);
    });
    log.success(`\nCompleted ${results.length} evaluations`);

    // Step 3: Extract
    log.info('\n=== Step 3/3: Extracting rule set ===');
    const extractor = new RuleSetExtractor();
    const ruleSet = extractor.buildRuleSet(opts.model, opts.model, patterns, results);

    const modelDir = opts.model.replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    const ruleSetDir = join(config.outputDir, 'rulesets');
    await mkdir(ruleSetDir, { recursive: true });
    await writeFile(join(ruleSetDir, `${modelDir}.json`), JSON.stringify(ruleSet, null, 2));
    await writeFile(join(ruleSetDir, `${modelDir}_meta-prompt.md`), ruleSet.metaPrompt);
    await writeFile(join(ruleSetDir, `${modelDir}_rewrite-instructions.md`), ruleSet.rewriteInstructions);

    log.success(`Rule set saved to ${ruleSetDir}/${modelDir}.json`);
    log.info('\nTop rules:');
    for (const rule of ruleSet.rules.slice(0, 5)) {
      log.info(`  [${rule.dimension}] ${rule.recommendation} (confidence: ${rule.confidence})`);
    }
  });

// ── Build All Command ──────────────────────────────────────────────────

program
  .command('build-all')
  .description('Discover new models on OpenRouter and build rule sets for each')
  .option('-n, --count <number>', 'Patterns per model', '1000')
  .option('-j, --judge <model>', 'Judge model', 'openai/gpt-4o-mini')
  .option('--max-models <number>', 'Maximum models to process', '10')
  .action(async (opts) => {
    const config = loadConfig();
    const client = new OpenRouterClient(config.openRouterApiKey);
    const discovery = new ModelDiscovery(client, config.outputDir);
    const count = parseInt(opts.count, 10);
    const maxModels = parseInt(opts.maxModels, 10);

    log.info('Discovering new models on OpenRouter...');
    const newModels = await discovery.getNewModels(config.modelFilter);
    const toProcess = newModels.slice(0, maxModels);

    if (toProcess.length === 0) {
      log.success('All models already have rule sets. Nothing to do.');
      return;
    }

    log.info(`Found ${newModels.length} models without rule sets. Processing ${toProcess.length}...`);

    // Generate patterns once, reuse for all models
    const patterns = generatePatterns(count);
    const patternsDir = join(config.outputDir, 'patterns');
    await mkdir(patternsDir, { recursive: true });
    await writeFile(join(patternsDir, 'patterns.json'), JSON.stringify(patterns, null, 2));

    for (let i = 0; i < toProcess.length; i++) {
      const model = toProcess[i];
      log.info(`\n=== Model ${i + 1}/${toProcess.length}: ${model.id} ===`);

      try {
        const engine = new EvaluationEngine(client, config, opts.judge);
        const results = await engine.evaluateModel(model.id, patterns, (progress) => {
          log.progress(progress.completed, progress.total, progress.currentPattern);
        });

        const extractor = new RuleSetExtractor();
        const ruleSet = extractor.buildRuleSet(model.id, model.name, patterns, results);

        const modelDir = model.id.replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
        const ruleSetDir = join(config.outputDir, 'rulesets');
        await mkdir(ruleSetDir, { recursive: true });
        await writeFile(join(ruleSetDir, `${modelDir}.json`), JSON.stringify(ruleSet, null, 2));
        await writeFile(join(ruleSetDir, `${modelDir}_meta-prompt.md`), ruleSet.metaPrompt);
        await writeFile(join(ruleSetDir, `${modelDir}_rewrite-instructions.md`), ruleSet.rewriteInstructions);

        log.success(`Rule set complete for ${model.id}`);
      } catch (err) {
        log.error(`Failed for ${model.id}: ${(err as Error).message}`);
      }
    }

    log.success('\nDone. All processed models have rule sets.');
  });

program.parse();
