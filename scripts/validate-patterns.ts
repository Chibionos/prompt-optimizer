import { readFileSync } from 'fs';
import type { PromptPattern } from '../src/types/index.js';

const patterns: PromptPattern[] = JSON.parse(
  readFileSync('patterns/all-1000-patterns.json', 'utf-8'),
);

let errors = 0;

// 1. Count
if (patterns.length === 1000) {
  console.log('OK: 1000 patterns');
} else {
  console.log('FAIL: count is', patterns.length);
  errors++;
}

// 2. Unique IDs
const ids = new Set(patterns.map((p) => p.id));
if (ids.size === 1000) {
  console.log('OK: all IDs unique');
} else {
  console.log('FAIL: duplicate IDs, only', ids.size, 'unique');
  errors++;
}

// 3. Unique dimension combos (all 7 dimensions)
const combos = new Set(
  patterns.map((p) =>
    [p.structure, p.detail, p.tone, p.contextPlacement, p.constraintStyle, p.outputSpec, p.engineeringPattern].join('|'),
  ),
);
if (combos.size === 1000) {
  console.log('OK: all dimension combos unique');
} else {
  console.log('FAIL: duplicate combos, only', combos.size, 'unique');
  errors++;
}

// 4. Unique rendered prompts
const prompts = new Set(patterns.map((p) => p.renderedPrompt));
if (prompts.size === 1000) {
  console.log('OK: all rendered prompts unique');
} else {
  console.log('FAIL: duplicate prompts, only', prompts.size, 'unique');
  errors++;
}

// 5. Every pattern has all required fields
const requiredFields = [
  'id', 'hypothesis', 'domain', 'task', 'complexity',
  'structure', 'detail', 'tone', 'contextPlacement',
  'constraintStyle', 'outputSpec', 'engineeringPattern', 'renderedPrompt',
] as const;
let missingFields = 0;
for (const p of patterns) {
  for (const f of requiredFields) {
    if (!p[f]) missingFields++;
  }
}
if (missingFields === 0) {
  console.log('OK: all fields present on all patterns');
} else {
  console.log('FAIL:', missingFields, 'missing fields');
  errors++;
}

// 6. No broken grammar
const grammarChecks = [
  { pattern: 'Ensure you the', label: '"Ensure you the"' },
  { pattern: 'Do NOT numbers', label: '"Do NOT numbers"' },
  { pattern: 'Do NOT the', label: '"Do NOT the"' },
];
for (const check of grammarChecks) {
  const broken = patterns.filter((p) => p.renderedPrompt.includes(check.pattern));
  if (broken.length === 0) {
    console.log(`OK: no ${check.label} grammar errors`);
  } else {
    console.log(`FAIL: ${broken.length} broken ${check.label} patterns`);
    errors++;
  }
}

// 7. All 10 structure types present
const structures = new Set(patterns.map((p) => p.structure));
if (structures.size === 10) {
  console.log('OK: all 10 structure types covered');
} else {
  console.log('FAIL: only', structures.size, 'structures');
  errors++;
}

// 7b. All 10 engineering patterns present
const engPatterns = new Set(patterns.map((p) => p.engineeringPattern));
if (engPatterns.size === 10) {
  console.log(`OK: all 10 engineering patterns covered: ${[...engPatterns].join(', ')}`);
} else {
  console.log('FAIL: only', engPatterns.size, 'engineering patterns');
  errors++;
}

// 8. Domain coverage
const domains = new Set(patterns.map((p) => p.domain));
console.log(`OK: ${domains.size} domains covered: ${[...domains].join(', ')}`);

// 9. Complexity coverage
const complexities = new Set(patterns.map((p) => p.complexity));
console.log(`OK: ${complexities.size} complexity levels: ${[...complexities].join(', ')}`);

// 10. Prompt length distribution
const lengths = patterns.map((p) => p.renderedPrompt.length);
const minLen = Math.min(...lengths);
const maxLen = Math.max(...lengths);
const avgLen = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
console.log(`Prompt lengths: min=${minLen} avg=${avgLen} max=${maxLen}`);

console.log('');
if (errors === 0) {
  console.log('ALL 1000 PATTERNS VALIDATED SUCCESSFULLY');
} else {
  console.log('FAILURES:', errors);
  process.exit(1);
}
