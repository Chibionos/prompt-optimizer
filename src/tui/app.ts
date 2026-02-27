#!/usr/bin/env node

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { banner } from './render.js';
import {
  screenGenerate,
  screenEvaluate,
  screenViewResults,
  screenViewRuleSet,
  screenRewrite,
  screenFullPipeline,
  screenInspectPatterns,
} from './screens.js';

async function main() {
  banner();

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // API key missing is OK for some screens
    config = {
      openRouterApiKey: '',
      concurrencyLimit: 5,
      patternCount: 1000,
      outputDir: process.env.OUTPUT_DIR || './output',
      modelFilter: null,
    };
  }

  p.intro(chalk.dim('Interactive prompt pattern testing & rule discovery'));

  while (true) {
    const action = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'inspect', label: '🔍  Inspect Patterns     — Browse & filter the 1000 patterns', hint: 'no API key needed' },
        { value: 'generate', label: '⚙️   Generate Patterns    — Create 1K-10K prompt patterns', hint: 'no API key needed' },
        { value: 'evaluate', label: '🧪  Evaluate Model       — Run patterns against a model via OpenRouter' },
        { value: 'results', label: '📊  View Results         — See evaluation scores & dimension breakdown' },
        { value: 'ruleset', label: '📋  View Rule Set        — See extracted model preferences' },
        { value: 'rewrite', label: '✏️   Rewrite Prompt       — Optimize a prompt using a rule set' },
        { value: 'pipeline', label: '🚀  Full Pipeline        — Generate → Evaluate → Extract in one go' },
        { value: 'quit', label: '👋  Quit' },
      ],
    });

    if (p.isCancel(action) || action === 'quit') {
      p.outro(chalk.dim('Goodbye!'));
      process.exit(0);
    }

    // Check API key for screens that need it
    const needsKey = ['evaluate', 'pipeline', 'rewrite'];
    if (needsKey.includes(action as string) && !config.openRouterApiKey) {
      p.log.error(
        chalk.red('OPENROUTER_API_KEY is required for this action.\n') +
        chalk.dim('  Set it in .env or export OPENROUTER_API_KEY=sk-or-v1-...\n') +
        chalk.dim('  Get your key at https://openrouter.ai/keys'),
      );
      continue;
    }

    try {
      switch (action) {
        case 'inspect':
          await screenInspectPatterns(config);
          break;
        case 'generate':
          await screenGenerate(config);
          break;
        case 'evaluate':
          await screenEvaluate(config);
          break;
        case 'results':
          await screenViewResults(config);
          break;
        case 'ruleset':
          await screenViewRuleSet(config);
          break;
        case 'rewrite':
          await screenRewrite(config);
          break;
        case 'pipeline':
          await screenFullPipeline(config);
          break;
      }
    } catch (err) {
      p.log.error(chalk.red((err as Error).message));
    }
  }
}

main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
