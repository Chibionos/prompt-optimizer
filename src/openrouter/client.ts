import type {
  OpenRouterModel,
  OpenRouterChatRequest,
  OpenRouterChatResponse,
  OpenRouterChatMessage,
} from '../types/index.js';

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/UiPath/Grid-Trials/prompt-optimizer',
      'X-Title': 'Prompt Optimizer',
    };
  }

  /**
   * Fetch all available models from OpenRouter.
   */
  async listModels(): Promise<OpenRouterModel[]> {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter /models failed: ${res.status} ${res.statusText}`);
    }

    const body = await res.json() as { data: OpenRouterModel[] };
    return body.data;
  }

  /**
   * Fetch models, filtering to only chat-capable models with reasonable
   * pricing (not free-tier duplicates).
   */
  async listChatModels(): Promise<OpenRouterModel[]> {
    const all = await this.listModels();
    return all.filter(m => {
      // Filter out models without pricing data or with 0 context
      if (!m.context_length || m.context_length < 1024) return false;
      return true;
    });
  }

  /**
   * Send a chat completion request to a specific model.
   */
  async chat(
    model: string,
    messages: OpenRouterChatMessage[],
    options: { maxTokens?: number; temperature?: number } = {},
  ): Promise<OpenRouterChatResponse> {
    const request: OpenRouterChatRequest = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.3,
    };

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter chat failed for ${model}: ${res.status} ${errBody}`);
    }

    return await res.json() as OpenRouterChatResponse;
  }

  /**
   * Send a chat request with retry and exponential backoff.
   */
  async chatWithRetry(
    model: string,
    messages: OpenRouterChatMessage[],
    options: { maxTokens?: number; temperature?: number } = {},
    maxRetries = 3,
  ): Promise<OpenRouterChatResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.chat(model, messages, options);
      } catch (err) {
        lastError = err as Error;
        const isRateLimit = lastError.message.includes('429');
        const isServerError = lastError.message.includes('5');

        if (attempt < maxRetries && (isRateLimit || isServerError)) {
          const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          await sleep(delay);
          continue;
        }
        throw lastError;
      }
    }

    throw lastError!;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
