import type { PromptPattern, EvaluationResult } from '../types/index.js';
import { OpenRouterClient } from '../openrouter/client.js';

/**
 * Scores a model's response to a prompt pattern.
 *
 * Scoring strategy: We use a "judge" model to evaluate the response
 * against the original instruction. This is an LLM-as-judge approach
 * where we ask a capable model to rate the response on multiple axes.
 *
 * When no judge model is available, falls back to heuristic scoring.
 */

const JUDGE_SYSTEM_PROMPT = `You are an expert prompt-response evaluator. You will be given an original prompt and a model's response. Rate the response on these axes from 0.0 to 1.0:

1. instruction_adherence: Did the response follow what was asked?
2. format_compliance: Did it match the requested output format (if any)?
3. completeness: Did it address all parts of the prompt?
4. clarity: Is the response clear and unambiguous?
5. no_hallucination: Did it avoid fabricating facts or making unsupported claims?

Respond ONLY with a JSON object, no other text:
{"instruction_adherence": 0.0, "format_compliance": 0.0, "completeness": 0.0, "clarity": 0.0, "no_hallucination": 0.0}`;

/**
 * Use an LLM judge to score a response.
 */
export async function scoreWithJudge(
  client: OpenRouterClient,
  judgeModel: string,
  pattern: PromptPattern,
  response: string,
): Promise<EvaluationResult['scores']> {
  try {
    const judgeResponse = await client.chatWithRetry(judgeModel, [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `## Original Prompt\n${pattern.renderedPrompt}\n\n## Model Response\n${response}`,
      },
    ], { maxTokens: 256, temperature: 0.0 });

    const content = judgeResponse.choices[0]?.message?.content ?? '';
    const parsed = extractJsonFromResponse(content);

    if (parsed) {
      const overall = computeOverall(parsed);
      return { ...parsed, overall };
    }
  } catch {
    // Fall through to heuristic
  }

  return scoreWithHeuristics(pattern, response);
}

/**
 * Heuristic scoring when no judge model is available.
 * Uses structural analysis of the response.
 */
export function scoreWithHeuristics(
  pattern: PromptPattern,
  response: string,
): EvaluationResult['scores'] {
  const scores = {
    instruction_adherence: 0,
    format_compliance: 0,
    completeness: 0,
    clarity: 0,
    no_hallucination: 0,
    overall: 0,
  };

  // ── Instruction adherence ──────────────────────────────────────
  // Check if key terms from the task appear in the response
  const taskWords = pattern.task.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const responseWords = response.toLowerCase();
  const wordHits = taskWords.filter(w => responseWords.includes(w)).length;
  scores.instruction_adherence = Math.min(1, wordHits / Math.max(1, taskWords.length * 0.5));

  // ── Format compliance ──────────────────────────────────────────
  scores.format_compliance = checkFormatCompliance(pattern, response);

  // ── Completeness ───────────────────────────────────────────────
  // Longer responses for complex tasks = higher completeness
  const expectedLength = pattern.detail === 'verbose' ? 500 : pattern.detail === 'moderate' ? 200 : 100;
  scores.completeness = Math.min(1, response.length / expectedLength);

  // ── Clarity ────────────────────────────────────────────────────
  // Check sentence structure: shorter average sentence length = clearer
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLen = sentences.reduce((a, s) => a + s.split(/\s+/).length, 0) / Math.max(1, sentences.length);
  scores.clarity = avgSentenceLen < 30 ? 0.8 : avgSentenceLen < 50 ? 0.5 : 0.3;

  // Refusal detection: if the model refused, clarity is 0
  if (isRefusal(response)) {
    scores.clarity = 0.2;
    scores.instruction_adherence = 0.1;
  }

  // ── No hallucination ───────────────────────────────────────────
  // Heuristic: presence of hedging language suggests less hallucination
  const hedges = ['approximately', 'roughly', 'generally', 'typically', 'may', 'might', 'often'];
  const hedgeCount = hedges.filter(h => responseWords.includes(h)).length;
  scores.no_hallucination = Math.min(1, 0.6 + hedgeCount * 0.1);

  scores.overall = computeOverall(scores);
  return scores;
}

function checkFormatCompliance(pattern: PromptPattern, response: string): number {
  switch (pattern.outputSpec) {
    case 'json': {
      try {
        // Try to find and parse JSON in the response
        const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          JSON.parse(jsonMatch[0]);
          return 1.0;
        }
        return 0.1;
      } catch {
        return 0.1;
      }
    }
    case 'markdown': {
      const hasHeaders = /^#{1,6}\s/m.test(response);
      const hasLists = /^[-*]\s/m.test(response) || /^\d+\.\s/m.test(response);
      return (hasHeaders ? 0.5 : 0) + (hasLists ? 0.5 : 0);
    }
    case 'code_only': {
      const hasCodeBlock = /```/.test(response);
      const hasExplanation = response.replace(/```[\s\S]*?```/g, '').trim().length > 50;
      return hasCodeBlock ? (hasExplanation ? 0.5 : 1.0) : 0.3;
    }
    case 'structured_template': {
      const hasSections = /^##\s/m.test(response);
      return hasSections ? 0.8 : 0.3;
    }
    case 'free_form':
      return 0.8; // Any format is fine
  }
}

function computeOverall(scores: Omit<EvaluationResult['scores'], 'overall'>): number {
  // Weighted average favoring instruction adherence and completeness
  return (
    scores.instruction_adherence * 0.30 +
    scores.format_compliance * 0.20 +
    scores.completeness * 0.25 +
    scores.clarity * 0.15 +
    scores.no_hallucination * 0.10
  );
}

function isRefusal(response: string): boolean {
  const lower = response.toLowerCase();
  const refusalPhrases = [
    "i can't help",
    "i cannot help",
    "i'm not able to",
    "i am not able to",
    "as an ai",
    "i don't have the ability",
    "i must decline",
    "i'm unable to",
  ];
  return refusalPhrases.some(p => lower.includes(p));
}

function extractJsonFromResponse(content: string): Omit<EvaluationResult['scores'], 'overall'> | null {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (
      typeof parsed.instruction_adherence === 'number' &&
      typeof parsed.format_compliance === 'number' &&
      typeof parsed.completeness === 'number' &&
      typeof parsed.clarity === 'number' &&
      typeof parsed.no_hallucination === 'number'
    ) {
      return {
        instruction_adherence: clamp(parsed.instruction_adherence),
        format_compliance: clamp(parsed.format_compliance),
        completeness: clamp(parsed.completeness),
        clarity: clamp(parsed.clarity),
        no_hallucination: clamp(parsed.no_hallucination),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
