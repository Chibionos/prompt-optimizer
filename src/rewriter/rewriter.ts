import type { RuleSet } from '../types/index.js';
import { OpenRouterClient } from '../openrouter/client.js';

/**
 * The PromptRewriter takes an arbitrary prompt/prose and restructures it
 * according to a model's empirically-derived rule set.
 *
 * Two modes:
 * 1. LLM-assisted: Uses a model to intelligently rewrite the prompt
 * 2. Template-based: Applies structural transformations without an LLM call
 */
export class PromptRewriter {
  private client: OpenRouterClient | null;
  private rewriterModel: string;

  constructor(client?: OpenRouterClient, rewriterModel?: string) {
    this.client = client ?? null;
    this.rewriterModel = rewriterModel ?? 'openai/gpt-4o-mini';
  }

  /**
   * Rewrite a prompt using a model, guided by the rule set.
   */
  async rewriteWithLLM(
    originalPrompt: string,
    ruleSet: RuleSet,
  ): Promise<string> {
    if (!this.client) {
      return this.rewriteWithTemplate(originalPrompt, ruleSet);
    }

    const systemMessage = `You are a prompt optimization assistant. Your job is to rewrite user prompts so that they are optimally structured for a specific LLM.

${ruleSet.rewriteInstructions}

IMPORTANT RULES:
- Preserve the original intent and meaning exactly.
- Do not add information that wasn't in the original.
- Do not remove any requirements from the original.
- Only change the STRUCTURE, TONE, and FORMAT — not the content.
- Return ONLY the rewritten prompt, nothing else.`;

    const response = await this.client.chatWithRetry(this.rewriterModel, [
      { role: 'system', content: systemMessage },
      { role: 'user', content: `Rewrite this prompt for optimal execution by ${ruleSet.modelName}:\n\n${originalPrompt}` },
    ], {
      maxTokens: 2048,
      temperature: 0.2,
    });

    return response.choices[0]?.message?.content ?? originalPrompt;
  }

  /**
   * Rewrite a prompt using template-based structural transformations.
   * No API call needed — works entirely offline.
   */
  rewriteWithTemplate(originalPrompt: string, ruleSet: RuleSet): string {
    const parts: string[] = [];

    // Extract preferred values from rules
    const prefs = extractPreferences(ruleSet);

    // ── Apply structure preference ─────────────────────────────────
    const structuredContent = applyStructure(originalPrompt, prefs.structure);

    // ── Apply tone ─────────────────────────────────────────────────
    const tonedContent = applyTone(structuredContent, prefs.tone);

    // ── Apply context placement ────────────────────────────────────
    parts.push(tonedContent);

    // ── Apply constraint style ─────────────────────────────────────
    const constraints = extractImplicitConstraints(originalPrompt);
    if (constraints.length > 0) {
      parts.push(formatConstraints(constraints, prefs.constraintStyle));
    }

    // ── Apply output spec ──────────────────────────────────────────
    const outputDirective = buildOutputDirective(prefs.outputSpec);
    if (outputDirective) {
      parts.push(outputDirective);
    }

    return parts.join('\n\n');
  }
}

// ── Internal helpers ───────────────────────────────────────────────────

interface Preferences {
  structure: string;
  detail: string;
  tone: string;
  contextPlacement: string;
  constraintStyle: string;
  outputSpec: string;
}

function extractPreferences(ruleSet: RuleSet): Preferences {
  const defaults: Preferences = {
    structure: 'enumerated',
    detail: 'moderate',
    tone: 'formal',
    contextPlacement: 'before_instruction',
    constraintStyle: 'bulleted',
    outputSpec: 'free_form',
  };

  for (const rule of ruleSet.rules) {
    if (rule.preferredValues.length > 0) {
      const key = rule.dimension as keyof Preferences;
      if (key in defaults) {
        defaults[key] = rule.preferredValues[0];
      }
    }
  }

  return defaults;
}

function applyStructure(prompt: string, structure: string): string {
  switch (structure) {
    case 'enumerated': {
      // Break into sentences and number them
      const sentences = prompt.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      if (sentences.length <= 1) return prompt;
      return sentences.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
    }

    case 'chain_of_thought':
      return `${prompt}\n\nThink through this step by step, showing your reasoning at each stage.`;

    case 'role_play': {
      // Detect domain from content
      const domain = detectDomain(prompt);
      return `You are an expert in ${domain}. A client has asked:\n\n${prompt}\n\nProvide your professional analysis.`;
    }

    case 'decomposed': {
      return `${prompt}\n\nBreak this into sub-tasks:\nA. Identify the key components.\nB. Analyze each one.\nC. Synthesize a recommendation.`;
    }

    case 'constraint_first': {
      return `Requirements:\n- Be specific and actionable\n- Ground answers in real-world applicability\n\nTask: ${prompt}`;
    }

    case 'imperative':
    default:
      return prompt;
  }
}

function applyTone(prompt: string, tone: string): string {
  switch (tone) {
    case 'casual':
      return `Hey, I need help with something.\n\n${prompt}`;
    case 'conversational':
      return `I've been thinking about this and want your take.\n\n${prompt}`;
    case 'technical':
    case 'formal':
    default:
      return prompt;
  }
}

function extractImplicitConstraints(prompt: string): string[] {
  const constraints: string[] = [];
  const lower = prompt.toLowerCase();

  // Detect implicit constraints
  if (lower.includes('must') || lower.includes('should') || lower.includes('need to')) {
    const sentences = prompt.split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const sl = s.toLowerCase();
      if (sl.includes('must') || sl.includes('should') || sl.includes('need to')) {
        constraints.push(s.trim());
      }
    }
  }

  return constraints;
}

function formatConstraints(constraints: string[], style: string): string {
  switch (style) {
    case 'bulleted':
      return `Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}`;
    case 'negative':
      return constraints.map(c => `Do NOT skip: ${c}`).join('\n');
    case 'positive':
      return constraints.map(c => `Ensure: ${c}`).join('\n');
    case 'inline':
      return `Keep in mind: ${constraints.join(', and ')}.`;
    default:
      return '';
  }
}

function buildOutputDirective(outputSpec: string): string | null {
  switch (outputSpec) {
    case 'json':
      return 'Return your response as valid JSON.';
    case 'markdown':
      return 'Format your response using Markdown with headers and lists.';
    case 'structured_template':
      return 'Structure: ## Title, ## Summary, ## Details, ## Next Steps';
    case 'code_only':
      return 'Return only code, no explanations.';
    case 'free_form':
    default:
      return null;
  }
}

function detectDomain(prompt: string): string {
  const lower = prompt.toLowerCase();
  const domains: [string, string[]][] = [
    ['software engineering', ['code', 'function', 'api', 'database', 'bug', 'deploy']],
    ['finance', ['budget', 'invest', 'tax', 'money', 'savings', 'debt']],
    ['health and wellness', ['health', 'exercise', 'diet', 'medical', 'fitness']],
    ['data analysis', ['data', 'metrics', 'analysis', 'sql', 'statistics']],
    ['writing and communication', ['write', 'email', 'letter', 'draft', 'document']],
    ['project management', ['project', 'sprint', 'deadline', 'team', 'stakeholder']],
  ];

  for (const [domain, keywords] of domains) {
    if (keywords.some(k => lower.includes(k))) {
      return domain;
    }
  }
  return 'the relevant domain';
}
