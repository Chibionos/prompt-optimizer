import { z } from 'zod';

// ── Prompt Pattern Dimensions ──────────────────────────────────────────
// Each dimension represents a structural axis we vary across patterns.

export const StructureStyle = z.enum([
  'imperative',          // "Do X. Then Y."
  'interrogative',       // "What is the best way to X?"
  'conditional',         // "If X, then Y. Otherwise Z."
  'enumerated',          // "1. First do X  2. Then Y  3. Finally Z"
  'role_play',           // "You are a senior engineer. Given X, do Y."
  'chain_of_thought',    // "Think step by step about X."
  'few_shot',            // "Example: Input A -> Output B. Now do Input C."
  'constraint_first',    // "Constraints: ... Now, given these constraints, do X."
  'output_template',     // "Respond using this format: ..."
  'decomposed',          // "Sub-task 1: ... Sub-task 2: ... Combine results."
]);

export const DetailLevel = z.enum([
  'minimal',             // Bare instruction
  'moderate',            // Instruction + context
  'verbose',             // Instruction + context + constraints + examples
]);

export const ToneRegister = z.enum([
  'formal',
  'casual',
  'technical',
  'conversational',
]);

export const ContextPlacement = z.enum([
  'before_instruction',  // Context first, then instruction
  'after_instruction',   // Instruction first, then context
  'interleaved',         // Context and instruction mixed
  'none',                // No context given
]);

export const ConstraintStyle = z.enum([
  'inline',              // Constraints woven into prose
  'bulleted',            // Constraints as bullet list
  'negative',            // "Do NOT do X"
  'positive',            // "Make sure to do X"
  'none',                // No explicit constraints
]);

export const OutputSpecification = z.enum([
  'free_form',           // No output format specified
  'json',                // "Return as JSON"
  'markdown',            // "Format as markdown"
  'structured_template', // "Use this exact template: ..."
  'code_only',           // "Return only code, no explanation"
]);

// ── Prompt Engineering Patterns ──────────────────────────────────────
// These test specific formatting/encoding patterns that LLMs may or may
// not respect. The core question: does the model parse and follow these?

export const PromptEngineeringPattern = z.enum([
  'plain_text',              // No special formatting -- baseline
  'xml_blocks',              // Instructions wrapped in <instruction>...</instruction> XML tags
  'json_config',             // Instructions encoded as a JSON object in the prompt
  'markdown_sections',       // Instructions organized under ## headers
  'triple_backtick_fenced',  // Key content inside ```...``` fences
  'numbered_priority',       // Instructions explicitly ordered: "[PRIORITY 1] ... [PRIORITY 2] ..."
  'key_value_pairs',         // Instructions as "KEY: value" pairs
  'nested_xml',              // Multiple nested XML tags: <task><context>...</context><instruction>...</instruction></task>
  'system_user_separation',  // Simulates system/user role split within a single prompt
  'delimiter_separated',     // Sections separated by "---" or "===" delimiters
]);

export type StructureStyle = z.infer<typeof StructureStyle>;
export type DetailLevel = z.infer<typeof DetailLevel>;
export type ToneRegister = z.infer<typeof ToneRegister>;
export type ContextPlacement = z.infer<typeof ContextPlacement>;
export type ConstraintStyle = z.infer<typeof ConstraintStyle>;
export type OutputSpecification = z.infer<typeof OutputSpecification>;
export type PromptEngineeringPattern = z.infer<typeof PromptEngineeringPattern>;

// ── Pattern Definition ─────────────────────────────────────────────────

export interface PromptPattern {
  id: string;
  hypothesis: string;         // what specific structural question this pattern tests
  domain: string;             // life domain: finance, health, code, writing, etc.
  task: string;               // the actual task description
  complexity: 'easy' | 'medium' | 'hard';
  structure: StructureStyle;
  detail: DetailLevel;
  tone: ToneRegister;
  contextPlacement: ContextPlacement;
  constraintStyle: ConstraintStyle;
  outputSpec: OutputSpecification;
  engineeringPattern: PromptEngineeringPattern; // prompt encoding format being tested
  renderedPrompt: string;     // the fully assembled prompt string
}

// ── Evaluation ─────────────────────────────────────────────────────────

export interface EvaluationResult {
  patternId: string;
  modelId: string;
  response: string;
  scores: {
    instruction_adherence: number;   // 0-1: did it follow the instruction?
    format_compliance: number;       // 0-1: did it match requested format?
    completeness: number;            // 0-1: did it cover all sub-tasks?
    clarity: number;                 // 0-1: is the response unambiguous?
    no_hallucination: number;        // 0-1: did it avoid making things up?
    overall: number;                 // weighted composite
  };
  latencyMs: number;
  tokenUsage: {
    prompt: number;
    completion: number;
  };
}

// ── Aggregated Stats Per Dimension ─────────────────────────────────────

export interface DimensionStats {
  dimension: string;           // e.g. "structure"
  value: string;               // e.g. "enumerated"
  sampleSize: number;
  meanOverall: number;
  stdDevOverall: number;
  meanAdherence: number;
  meanFormatCompliance: number;
  meanCompleteness: number;
  meanClarity: number;
}

// ── Rule Set ───────────────────────────────────────────────────────────

export interface PromptRule {
  dimension: string;
  recommendation: string;      // e.g. "Use enumerated structure"
  preferredValues: string[];   // e.g. ["enumerated", "decomposed"]
  avoidValues: string[];       // e.g. ["minimal", "interrogative"]
  confidence: number;          // 0-1 based on sample size and variance
  evidence: string;            // human-readable summary of why
}

export interface RuleSet {
  modelId: string;
  modelName: string;
  generatedAt: string;
  patternsTested: number;
  rules: PromptRule[];
  metaPrompt: string;          // a composite "system prompt" embodying all rules
  rewriteInstructions: string; // instructions for rewriting arbitrary prose
}

// ── OpenRouter Types ───────────────────────────────────────────────────

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  top_provider: {
    max_completion_tokens: number;
  };
}

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface OpenRouterChatResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ── Config ─────────────────────────────────────────────────────────────

export interface Config {
  openRouterApiKey: string;
  concurrencyLimit: number;
  patternCount: number;
  outputDir: string;
  modelFilter: string[] | null;
}
