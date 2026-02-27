import type { Config } from '../types/index.js';
import { config as loadDotenv } from 'dotenv';

export function loadConfig(): Config {
  loadDotenv();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is required. Set it in .env or as an environment variable.\n' +
      'Get your key at https://openrouter.ai/keys',
    );
  }

  const modelFilter = process.env.MODEL_FILTER
    ? process.env.MODEL_FILTER.split(',').map(s => s.trim())
    : null;

  return {
    openRouterApiKey: apiKey,
    concurrencyLimit: parseInt(process.env.CONCURRENCY_LIMIT ?? '5', 10),
    patternCount: parseInt(process.env.PATTERN_COUNT ?? '1000', 10),
    outputDir: process.env.OUTPUT_DIR ?? './output',
    modelFilter,
  };
}
