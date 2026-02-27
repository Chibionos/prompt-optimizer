# Empirical Prompt Optimizer

**Discover the optimal prompt structure for any LLM through large-scale empirical testing.**

This tool systematically tests 1,000-10,000 prompt patterns across 7 structural dimensions to build data-driven rulesets that maximize model performance. Instead of guessing what works, we measure it.

## 🎯 What This Does

1. **Generates** 1,000-10,000 unique prompt patterns covering all structural dimensions
2. **Evaluates** each pattern against your target model via OpenRouter
3. **Analyzes** responses using a judge model to score quality across 5 metrics
4. **Extracts** statistical rules showing what prompt structures work best
5. **Produces** actionable rulesets for rewriting prompts optimally

## 🚀 Quick Start

### Installation

```bash
npm install
npm run build
```

### Set API Key

```bash
export OPENROUTER_API_KEY="your-key-here"
```

### Run Full Pipeline (Standard Mode)

Test 1,000 patterns on Gemini Flash 3:

```bash
npm run full-pipeline -- \
  -m google/gemini-3-flash-preview \
  -n 1000 \
  -j openai/gpt-4o-mini
```

**Cost**: ~$1.50 | **Time**: ~25 minutes | **Quality**: Excellent (30+ samples per dimension)

### Run Full Pipeline (Quick Mode) ⚡

Test 200-350 patterns for faster, cheaper results:

```bash
npm run full-pipeline -- \
  -m anthropic/claude-sonnet-4.6 \
  --quick \
  -j openai/gpt-4o-mini
```

**Cost**: ~$3-4 (5x cheaper) | **Time**: ~9 minutes (5x faster) | **Quality**: Good (top 2-3 rules remain reliable)

## 📊 How It Works

### 7 Structural Dimensions Tested

1. **Structure Style** (10 values): imperative, interrogative, conditional, enumerated, role_play, chain_of_thought, few_shot, constraint_first, output_template, decomposed
2. **Detail Level** (3 values): minimal, moderate, verbose
3. **Tone Register** (4 values): formal, casual, technical, conversational
4. **Context Placement** (4 values): before_instruction, after_instruction, interleaved, none
5. **Constraint Style** (5 values): inline, bulleted, negative, positive, none
6. **Output Specification** (6 values): free_form, json, markdown, structured_template, code_only
7. **Engineering Pattern** (10 values): plain_text, xml_blocks, json_config, markdown_sections, triple_backtick_fenced, numbered_priority, key_value_pairs, nested_xml, system_user_separation, delimiter_separated

**Total Combinatorial Space**: 144,000 unique combinations

### Evaluation Metrics

Each response is scored 0-1 on:
- **instruction_adherence**: Did it follow the prompt?
- **format_compliance**: Did it match the requested format?
- **completeness**: Did it address all requirements?
- **clarity**: Is the response clear and well-organized?
- **no_hallucination**: Is it factually accurate?

### Statistical Analysis

Rules are ranked by:
- **Effect Size**: Spread between best and worst values (Cohen's d-like)
- **Sample Size**: Confidence penalty if <30 samples per value
- **Confidence Score**: `min(1, effectSize * sampleFactor * 0.5)`

## 📁 Output Structure

After running the pipeline, you'll get:

```
output/
├── patterns/
│   └── patterns.json              # All generated patterns
├── evaluations/
│   └── google_gemini-3-flash-preview/
│       └── results.json           # Raw evaluation results
└── rulesets/
    ├── google_gemini-3-flash-preview.json
    ├── google_gemini-3-flash-preview_meta-prompt.md
    └── google_gemini-3-flash-preview_rewrite-instructions.md
```

## 🎓 Example Ruleset (Gemini Flash 3)

From 1,000 patterns tested:

### Top Rules

1. **outputSpec** (Confidence: 1.0) 🔴 CRITICAL
   - ✅ JSON: 0.999 mean score (28% better than code_only)
   - ✅ Markdown: 0.990 mean score
   - ❌ code_only: 0.718 mean score

2. **structure** (Confidence: 0.291) 🟡 HIGH
   - ✅ few_shot: 0.972 mean score
   - ✅ decomposed: 0.971 mean score
   - ⚠️ chain_of_thought: 0.883 mean score

3. **constraintStyle** (Confidence: 0.165) 🟢 MEDIUM
   - ✅ positive: 0.960 mean score
   - ✅ bulleted: 0.960 mean score
   - ⚠️ negative: 0.897 mean score

**Real-World Impact**: Optimized prompts score 35-43% better than baseline prompts.

See `/rulesets/` folder for complete Gemini Flash 3 ruleset with examples.

## 🛠️ CLI Commands

### Generate Patterns Only

```bash
npm run generate -- -n 1000 -o ./output/patterns
```

### Discover Available Models

```bash
npm run discover-models
npm run discover-models --new-only  # Only models without rulesets
```

### Evaluate Existing Patterns

```bash
npm run evaluate -- \
  -m google/gemini-3-flash-preview \
  -p ./output/patterns/patterns.json \
  -j openai/gpt-4o-mini
```

### Extract Ruleset from Results

```bash
npm run extract -- \
  -m google/gemini-3-flash-preview \
  -p ./output/patterns/patterns.json \
  -e ./output/evaluations/google_gemini-3-flash-preview/results.json
```

### Rewrite a Prompt Using Ruleset

```bash
npm run rewrite -- \
  -m google/gemini-3-flash-preview \
  -i "Analyze this data and tell me what you find."
```

Output:
```
--- Rewritten ---
Analyze this data following this example:

Example:
Input: Q1: $100k, Q2: $150k, Q3: $140k
Output: {
  "total_revenue": "$390k",
  "trend": "generally increasing with slight Q3 dip",
  "strongest_quarter": "Q2 (+50% from Q1)"
}

Now analyze: [paste your data]

Return results in JSON format.
```

### Build Rulesets for All New Models

```bash
npm run build-all -- \
  -n 1000 \
  -j openai/gpt-4o-mini \
  --max-models 5
```

## ⚡ Quick Mode vs Standard Mode

### When to Use Quick Mode (`--quick`)

✅ **Use Quick Mode When:**
- Model is expensive (>$8 per 1K patterns)
- You only need top 2-3 rules
- You're doing rapid exploration
- Time is critical

✅ **Use Standard Mode When:**
- Model is cheap (<$3 per 1K patterns)
- You want maximum confidence
- You're building production rulesets
- You need 4-6 reliable rules

### Quality Trade-offs

| Mode | Patterns | Cost | Time | Top Rule Confidence | Total Rules |
|------|----------|------|------|---------------------|-------------|
| Standard | 1000 | $1-20 | 20-60min | 1.0 | 6 actionable |
| Quick | 200-350 | $0.30-4 | 5-15min | 0.85 | 2-3 actionable |

**Key Finding**: High-confidence rules (>0.5) remain reliable even with 200 patterns. Medium-confidence rules (0.1-0.5) lose 30-40% confidence but maintain correct ranking.

See `/rulesets/OPTIMIZATION-STRATEGY.md` for detailed analysis.

## 🌐 Official Prompting Guide Integration

This tool combines **empirical testing** with **official best practices** from:

### Claude (Anthropic)
- **Guide**: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- **Key Practices**: XML tags, few-shot examples, clear instructions, role definition, thinking capabilities

### GPT (OpenAI)
- **Guide**: https://developers.openai.com/api/docs/guides/prompt-engineering
- **Key Practices**: Message roles, few-shot learning, structured outputs, JSON schema

### Gemini (Google)
- **Guide**: https://ai.google.dev/gemini-api/docs/prompting-strategies
- **Key Practices**: Direct instructions, XML/Markdown formatting, zero-shot vs few-shot, grounding

**Recommended Workflow**:
1. Run empirical tests to discover model preferences
2. Cross-reference with official guides for best practices
3. Combine both sources into comprehensive rulesets

## 📦 Model Coverage Recommendations

### By Cost Tier

| Model Family | Cost/1K | Recommended Mode | Pattern Count |
|--------------|---------|------------------|---------------|
| Gemini Flash | <$2 | Standard | 1000 |
| GPT-4o-mini | $2-3 | Standard | 500-1000 |
| Claude Haiku | $3-5 | Standard | 500-1000 |
| Claude Sonnet | $10-20 | Quick | 200-350 |
| GPT-4 | $20-40 | Quick | 200-250 |

## 🔬 Methodology

### Why This Works

Traditional prompt engineering relies on:
- Anecdotal evidence ("this worked for me once")
- Model documentation (often generic)
- Trial and error

This tool uses:
- ✅ Large-scale empirical testing (1000+ patterns)
- ✅ Statistical analysis (confidence scores, effect sizes)
- ✅ Stratified sampling (ensures all dimensions tested)
- ✅ Deterministic evaluation (consistent judge model)

### Statistical Validity

- **Minimum sample size**: 30 per dimension value for full confidence
- **Total dimension values**: 32 across all dimensions
- **Minimum patterns needed**: 960 for 100% confidence on all rules
- **Default patterns**: 1000 (mathematically justified)

### Reproducibility

All tests are deterministic:
- Seeded PRNG for pattern generation (seed=42)
- Same judge model for all evaluations
- Version-controlled domain tasks

## 🤝 Building in the Open

This project is developed openly to:
1. Share findings with the AI prompting community
2. Enable others to build rulesets for their preferred models
3. Continuously improve methodology based on community feedback
4. Democratize access to empirical prompt optimization

### Contributing

Want to add rulesets for a new model or improve the methodology?

1. Fork the repository
2. Run tests on your target model
3. Share your rulesets and findings
4. Submit a PR with your contributions

**Areas for Contribution**:
- New model rulesets (especially Claude, GPT-4, Llama)
- Improved confidence calculation methods
- Additional evaluation metrics
- Prompt rewriting automation
- Integration with popular AI tools

## 📚 Resources

### Documentation

- [`/rulesets/README.md`](../rulesets/README.md) - How to use rulesets with Claude Code
- [`/rulesets/gemini-flash-3-comprehensive.md`](../rulesets/gemini-flash-3-comprehensive.md) - Complete Gemini Flash 3 ruleset
- [`/rulesets/gemini-flash-3-examples.md`](../rulesets/gemini-flash-3-examples.md) - 8 practical transformation examples
- [`/rulesets/OPTIMIZATION-STRATEGY.md`](../rulesets/OPTIMIZATION-STRATEGY.md) - Pattern count optimization analysis
- [`/rulesets/QUICK-TEST-COMPARISON.md`](../rulesets/QUICK-TEST-COMPARISON.md) - 200 vs 1000 pattern comparison

### Configuration

Edit `config.json` to customize:
- `openRouterApiKey`: Your OpenRouter API key
- `concurrencyLimit`: Parallel requests (default: 10)
- `requestTimeout`: Timeout per request (default: 60s)
- `modelFilter`: Regex to filter models (default: show all)
- `outputDir`: Where to save results (default: ./output)

## 🎯 Real-World Use Cases

### 1. Optimize Prompts for Your LLM Stack

If you're using Gemini Flash 3 for production, load the ruleset and automatically rewrite all your prompts.

### 2. Compare Models Empirically

Run the same 1000 patterns on Claude Sonnet vs GPT-4o to see which performs better on your specific tasks.

### 3. Build Model-Specific Interfaces

Create Claude Code extensions that automatically apply the optimal prompt structure for each model.

### 4. Research Prompt Engineering

Analyze how different models respond to structural variations and publish findings.

### 5. Cost Optimization

Use quick mode to rapidly test multiple models and find the best cost/performance ratio for your use case.

## 📈 Roadmap

- [ ] Web UI for pattern generation and analysis
- [ ] Integration with LangChain/LlamaIndex
- [ ] Automated prompt rewriting API
- [ ] Multi-model comparison dashboard
- [ ] Expanded domain tasks (currently 256)
- [ ] Real-time ruleset updates as models improve
- [ ] Community-contributed rulesets repository

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

Built with:
- [OpenRouter](https://openrouter.ai/) - Unified LLM API
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Zod](https://zod.dev/) - Type-safe configuration

Inspired by empirical research in prompt engineering and the need for data-driven optimization.

---

**Ready to discover what really works for your model?**

```bash
npm run full-pipeline -- -m YOUR_MODEL --quick
```

Let the data guide your prompts. 🚀
