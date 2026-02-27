# Prompt Optimization Rulesets

This directory contains empirically-derived rulesets for optimizing prompts across different LLM models.

## Available Rulesets

### Google Gemini Flash 3 (`google/gemini-3-flash-preview`)

- **Comprehensive Guide:** [`gemini-flash-3-comprehensive.md`](./gemini-flash-3-comprehensive.md)
  - Human-readable format with detailed explanations
  - Priority-ranked rules with confidence scores
  - Examples and transformation workflows
  - Best for understanding the "why" behind each optimization

- **Machine-Readable Rules:** [`gemini-flash-3-rules.json`](./gemini-flash-3-rules.json)
  - Structured JSON format for programmatic use
  - Easy to parse and integrate into tools
  - Best for Claude Code and automated prompt rewriting

**Test Results:**
- Patterns tested: 1,000
- Success rate: 100% (0 errors)
- Generated: 2026-02-27

## How to Use with Claude Code

### Method 1: Direct Reference (Recommended)

When you want Claude Code to optimize a prompt for Gemini Flash 3, simply reference the ruleset:

```
@/home/chibionos/r/grid-trials/rulesets/gemini-flash-3-comprehensive.md

Please rewrite this prompt to optimize it for Gemini Flash 3:
[Your original prompt here]
```

### Method 2: Inline Request

Ask Claude Code to apply the rules directly:

```
Using the Gemini Flash 3 ruleset at /home/chibionos/r/grid-trials/rulesets/,
rewrite this prompt: [Your prompt]
```

### Method 3: Programmatic Use

Load and parse the JSON ruleset:

```javascript
import ruleset from './rulesets/gemini-flash-3-rules.json';

// Apply rules in priority order
const criticalRules = ruleset.optimizationRules.filter(r => r.priority === 'CRITICAL');
const highPriorityRules = ruleset.optimizationRules.filter(r => r.priority === 'HIGH');
// ... apply transformations
```

## Quick Optimization Checklist

For **Gemini Flash 3**, always check:

- [ ] **JSON Output** (Confidence: 1.0) - Add JSON schema for structured responses
- [ ] **Few-Shot Examples** (Confidence: 0.291) - Include 1-2 examples for complex tasks
- [ ] **Positive Constraints** (Confidence: 0.165) - Reframe "don't do X" as "do Y"
- [ ] **Conversational Tone** (Confidence: 0.078) - Soften overly formal language
- [ ] **Context Placement** (Confidence: 0.063) - Put context after instruction or omit

### Avoid
- ❌ `code_only` output format (28.1% worse than JSON)
- ❌ Negative constraint phrasing (6.3% worse than positive)
- ❌ Chain-of-thought structure (8.9% worse than few-shot)

## Example Transformation

**Original Prompt:**
```
Don't use technical jargon. Analyze this data and don't include forecasts.
```

**Optimized Prompt:**
```
Analyze this data following this example:

Example:
Input: [Q1: $50k, Q2: $75k]
Output: {"total": "$125k", "trend": "increasing"}

Now analyze: [your data here]

Requirements:
• Use accessible language (no jargon)
• Include only historical analysis
• Return results in JSON format
```

**Improvements Applied:**
1. ✅ Added few-shot example (Confidence: 0.291)
2. ✅ Specified JSON output (Confidence: 1.0)
3. ✅ Converted negative to positive constraints (Confidence: 0.165)
4. ✅ Used bulleted list (Confidence: 0.165)

**Expected Performance Gain:** ~35% improvement based on ruleset data

## Adding New Rulesets

To add rulesets for other models:

1. Run the prompt optimizer tool:
   ```bash
   cd prompt-optimizer
   npm run full-pipeline -- -m MODEL_ID -n 1000 -j openai/gpt-4o-mini
   ```

2. Generate comprehensive ruleset:
   - Copy generated files from `output/rulesets/`
   - Create comprehensive markdown guide
   - Create machine-readable JSON version
   - Update this README

3. Test the ruleset:
   - Apply to sample prompts
   - Verify improvements match expected confidence scores

## Methodology

All rulesets are generated using empirical testing:

1. **Pattern Generation:** 1,000 unique prompt patterns across 7 dimensions
2. **Evaluation:** Each pattern tested against target model
3. **Scoring:** Judge model (GPT-4o-mini) scores responses
4. **Statistical Analysis:** Confidence scores derived from mean scores and sample sizes
5. **Rule Extraction:** Top-performing patterns become rules

Dimensions tested:
- `structure` - How the prompt is organized (few-shot, decomposed, etc.)
- `detail` - Level of verbosity (minimal, moderate, verbose)
- `tone` - Communication style (formal, casual, conversational, technical)
- `contextPlacement` - Where context appears (before, after, interleaved, none)
- `constraintStyle` - How requirements are expressed (positive, negative, bulleted, etc.)
- `outputSpec` - Desired output format (JSON, markdown, code, etc.)

## Confidence Scores

Rules are ranked by confidence, which represents the statistical significance and magnitude of performance difference:

- **1.0 - CRITICAL:** Apply always (very large impact)
- **0.2-0.5 - HIGH:** Strongly recommended (moderate-large impact)
- **0.1-0.2 - MEDIUM:** Recommended (small-moderate impact)
- **0.05-0.1 - LOW:** Nice to have (small impact)
- **<0.05 - MINIMAL:** Optional (marginal impact)

## License

These rulesets are derived from empirical testing and provided for optimization purposes. Use freely to improve prompt engineering.

## Contributing

To contribute new rulesets or improvements:

1. Run the optimizer with at least 1,000 patterns
2. Ensure 0 errors or document error patterns
3. Create both comprehensive and JSON versions
4. Add example transformations
5. Submit via pull request

## Support

For questions or issues:
- Check the comprehensive guide for detailed explanations
- Review example transformations
- Consult the statistical evidence in the JSON ruleset
