import { OpenRouterClient } from './client.js';
import type { OpenRouterModel } from '../types/index.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE_FILE = 'model-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ModelCache {
  fetchedAt: string;
  models: OpenRouterModel[];
}

/**
 * Discovers models available on OpenRouter, with local caching.
 * This is designed to be run periodically so that whenever OpenRouter
 * adds a new model, we can automatically generate a rule set for it.
 */
export class ModelDiscovery {
  private client: OpenRouterClient;
  private outputDir: string;

  constructor(client: OpenRouterClient, outputDir: string) {
    this.client = client;
    this.outputDir = outputDir;
  }

  /**
   * Get all available chat models, using cache if fresh enough.
   */
  async getModels(filter?: string[] | null): Promise<OpenRouterModel[]> {
    let models = await this.getCached();

    if (!models) {
      models = await this.client.listChatModels();
      await this.saveCache(models);
    }

    if (filter && filter.length > 0) {
      models = models.filter(m => filter.includes(m.id));
    }

    return models;
  }

  /**
   * Find models that don't have a rule set generated yet.
   */
  async getNewModels(filter?: string[] | null): Promise<OpenRouterModel[]> {
    const models = await this.getModels(filter);
    const existing = await this.getExistingRuleSets();

    return models.filter(m => !existing.has(m.id));
  }

  /**
   * List model IDs that already have rule sets on disk.
   */
  private async getExistingRuleSets(): Promise<Set<string>> {
    const ruleSetDir = join(this.outputDir, 'rulesets');
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(ruleSetDir);
      const ids = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', '').replace(/_/g, '/'));
      return new Set(ids);
    } catch {
      return new Set();
    }
  }

  private async getCached(): Promise<OpenRouterModel[] | null> {
    try {
      const cachePath = join(this.outputDir, CACHE_FILE);
      const raw = await readFile(cachePath, 'utf-8');
      const cache: ModelCache = JSON.parse(raw);

      const age = Date.now() - new Date(cache.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return cache.models;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async saveCache(models: OpenRouterModel[]): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    const cache: ModelCache = {
      fetchedAt: new Date().toISOString(),
      models,
    };
    await writeFile(
      join(this.outputDir, CACHE_FILE),
      JSON.stringify(cache, null, 2),
    );
  }
}
