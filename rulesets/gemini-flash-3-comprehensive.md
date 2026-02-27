# Comprehensive Prompt Optimization Ruleset for Google Gemini Flash 3

**Model ID:** `google/gemini-3-flash-preview`
**Generated:** 2026-02-27
**Patterns Tested:** 1000
**Success Rate:** 100% (0 errors)

---

## Executive Summary

This ruleset was empirically derived by testing 1,000 prompt patterns across 7 structural dimensions. Use these guidelines when rewriting prompts to maximize Gemini Flash 3 performance.

---

## Priority-Ranked Optimization Rules

### 🔴 CRITICAL (Confidence: 1.0) - Apply Always

#### 1. Output Format Specification
**Rule:** Always specify JSON output format when requesting structured data.

**Evidence:**
- JSON: mean=0.999 (n=192, std=0.011) ✅ **BEST**
- Markdown: mean=0.99 (n=225, std=0.094)
- Free-form: mean=0.99 (n=171, std=0.083)
- Structured template: mean=0.978 (n=208, std=0.142)
- Code-only: mean=0.718 (n=204, std=0.438) ❌ **AVOID**

**Application:**
```
❌ BAD: "List the features"
✅ GOOD: "List the features in JSON format: {\"features\": [...]}"
```

---

### 🟡 HIGH PRIORITY (Confidence: 0.291) - Strongly Recommended

#### 2. Prompt Structure
**Rule:** Use few-shot examples, decomposed steps, or conditional logic.

**Evidence:**
- Few-shot: mean=0.972 (n=86, std=0.153) ✅ **BEST**
- Decomposed: mean=0.971 (n=93, std=0.161)
- Conditional: mean=0.959 (n=110, std=0.189)
- Constraint-first: mean=0.959 (n=113, std=0.191)
- Chain-of-thought: mean=0.883 (n=95, std=0.309) ⚠️ **LOWEST**

**Application:**
```
❌ BAD (Imperative):
"Analyze the data and provide insights"

✅ GOOD (Few-shot):
"Analyze the data following these examples:
Example 1: Input: [1,2,3] → Output: {\"mean\": 2, \"trend\": \"stable\"}
Example 2: Input: [5,10,15] → Output: {\"mean\": 10, \"trend\": \"increasing\"}
Now analyze: [data]"

✅ GOOD (Decomposed):
"Step 1: Calculate the mean of the data
Step 2: Identify the trend (increasing/decreasing/stable)
Step 3: Provide insights in JSON format"
```

---

### 🟢 MEDIUM PRIORITY (Confidence: 0.165) - Recommended

#### 3. Constraint Style
**Rule:** Frame constraints positively or use bulleted lists.

**Evidence:**
- Positive: mean=0.96 (n=212, std=0.191) ✅ **BEST**
- Bulleted: mean=0.96 (n=206, std=0.184)
- Inline: mean=0.936 (n=201, std=0.238)
- None: mean=0.909 (n=179, std=0.285)
- Negative: mean=0.897 (n=202, std=0.291) ⚠️ **LOWEST**

**Application:**
```
❌ BAD (Negative):
"Don't include personal information. Don't use technical jargon. Don't exceed 100 words."

✅ GOOD (Positive):
"Include only public information. Use accessible language. Keep response under 100 words."

✅ GOOD (Bulleted):
"Requirements:
• Use public information only
• Write in accessible language
• Limit to 100 words maximum"
```

---

### 🔵 LOW PRIORITY (Confidence: 0.078) - Nice to Have

#### 4. Tone
**Rule:** Use conversational or casual tone for better engagement.

**Evidence:**
- Conversational: mean=0.955 (n=253, std=0.204) ✅ **BEST**
- Casual: mean=0.929 (n=257, std=0.252)
- Technical: mean=0.927 (n=252, std=0.248)
- Formal: mean=0.923 (n=238, std=0.259) ⚠️ **LOWEST**

**Application:**
```
❌ BAD (Formal):
"Please provide a comprehensive analysis of the aforementioned dataset."

✅ GOOD (Conversational):
"Can you analyze this dataset? I'd like to understand the key patterns."
```

---

### ⚪ MINIMAL IMPACT (Confidence: 0.063) - Optional

#### 5. Context Placement
**Rule:** Prefer context-free prompts or place context after instruction.

**Evidence:**
- None: mean=0.948 (n=254, std=0.215) ✅ **BEST**
- After instruction: mean=0.934 (n=238, std=0.233)
- Before instruction: mean=0.932 (n=254, std=0.25)
- Interleaved: mean=0.921 (n=254, std=0.265) ⚠️ **LOWEST**

**Application:**
```
✅ GOOD (Context-free):
"Summarize the key points in JSON format"

✅ GOOD (Context after):
"Summarize the key points in JSON format.
Context: This is for a quarterly business review."

⚠️ ACCEPTABLE (Context before):
"Context: This is for a quarterly business review.
Summarize the key points in JSON format."
```

---

### ⚪ MINIMAL IMPACT (Confidence: 0.046) - Optional

#### 6. Detail Level
**Rule:** Minimal detail works slightly better, but differences are marginal.

**Evidence:**
- Minimal: mean=0.943 (n=307, std=0.229) ✅ **BEST**
- Verbose: mean=0.938 (n=339, std=0.237)
- Moderate: mean=0.922 (n=354, std=0.257) ⚠️ **LOWEST**

**Note:** The difference is only 2.1%, so choose based on task requirements.

---

## Prompt Rewriting Process for Claude Code

When Claude Code receives a user prompt, apply this transformation sequence:

### Step 1: Analyze Original Prompt
Identify:
- Core instruction (what the user wants)
- Context (background information)
- Constraints (requirements, limitations)
- Current output format (if any)

### Step 2: Apply Critical Rules (Confidence > 0.5)
1. **Add JSON specification** if structured output is needed
2. Transform to avoid "code_only" output format

### Step 3: Apply High Priority Rules (Confidence > 0.2)
1. **Restructure** using few-shot examples if applicable
2. **Decompose** into clear steps for complex tasks
3. Use **conditional logic** for decision-based tasks

### Step 4: Apply Medium Priority Rules (Confidence > 0.1)
1. **Convert negative constraints** to positive ones
2. **Format constraints** as bulleted lists
3. **Remove** unnecessary negative phrasing

### Step 5: Apply Low Priority Rules (Confidence < 0.1)
1. **Adjust tone** to conversational if overly formal
2. **Reorder** context placement if interleaved
3. **Simplify** verbosity if excessive

### Step 6: Verify Output
Ensure the rewritten prompt:
- ✅ Maintains user's original intent
- ✅ Uses JSON format for structured data
- ✅ Includes examples or decomposition for complex tasks
- ✅ Uses positive constraint framing
- ✅ Has conversational tone
- ✅ Is concise but complete

---

## Example Transformations

### Example 1: Simple Query → Optimized

**Before:**
```
What are the main features of Python?
```

**After:**
```
List the main features of Python in JSON format:
{
  "features": [
    {"name": "feature_name", "description": "brief_description"},
    ...
  ]
}

Use conversational language and focus on the 5 most important features.
```

**Changes Applied:**
- ✅ Added JSON output specification (Confidence 1.0)
- ✅ Added positive constraint (Confidence 0.165)
- ✅ Used conversational tone (Confidence 0.078)

---

### Example 2: Complex Task → Decomposed with Examples

**Before:**
```
Don't use technical jargon. Analyze this sales data: [Q1: $100k, Q2: $150k, Q3: $120k, Q4: $180k] and don't include any forecasts.
```

**After:**
```
Analyze the sales data following this example:

Example:
Input: [Q1: $50k, Q2: $75k, Q3: $80k, Q4: $100k]
Output:
{
  "total": "$305k",
  "trend": "increasing",
  "insights": ["Strong Q4 performance", "Consistent growth across quarters"]
}

Now analyze: Q1: $100k, Q2: $150k, Q3: $120k, Q4: $180k

Requirements:
• Use accessible language (no jargon)
• Include only historical analysis
• Return results in JSON format
```

**Changes Applied:**
- ✅ Changed to few-shot structure (Confidence 0.291)
- ✅ Added JSON output specification (Confidence 1.0)
- ✅ Converted negative constraints to positive (Confidence 0.165)
- ✅ Used bulleted list for constraints (Confidence 0.165)

---

### Example 3: Formal Request → Conversational with Structure

**Before:**
```
Please provide a comprehensive analysis of the aforementioned dataset and ensure the output does not exceed 200 words.
```

**After:**
```
Can you analyze this dataset? Break it down into these steps:

Step 1: Calculate key statistics (mean, median, range)
Step 2: Identify notable patterns or trends
Step 3: Summarize insights

Return your analysis in JSON format:
{
  "statistics": {...},
  "patterns": [...],
  "insights": "summary under 200 words"
}
```

**Changes Applied:**
- ✅ Changed to conversational tone (Confidence 0.078)
- ✅ Used decomposed structure (Confidence 0.291)
- ✅ Added JSON output specification (Confidence 1.0)
- ✅ Converted word limit to positive constraint (Confidence 0.165)

---

## Quick Reference Card for Claude Code

```
PRIORITY  | RULE                      | CONFIDENCE | ACTION
----------|---------------------------|------------|---------------------------
🔴 ALWAYS | JSON output format        | 1.0        | Add JSON schema
🟡 HIGH   | Few-shot structure        | 0.291      | Add 1-2 examples
🟡 HIGH   | Decomposed steps          | 0.291      | Break into numbered steps
🟢 MEDIUM | Positive constraints      | 0.165      | Reframe negatives
🟢 MEDIUM | Bulleted requirements     | 0.165      | Use • lists
🔵 LOW    | Conversational tone       | 0.078      | Soften formal language
⚪ MIN    | Context placement         | 0.063      | Move after instruction
⚪ MIN    | Minimal detail            | 0.046      | Simplify if verbose

AVOID: code_only format, negative constraints, chain-of-thought (for this model)
```

---

## Usage in Claude Code Workflow

1. **Detect Gemini Flash 3 Target:** When user specifies or Claude Code detects the target model is Gemini Flash 3
2. **Load This Ruleset:** Reference this document for transformation rules
3. **Apply Priority Order:** Start with 🔴 CRITICAL rules, work down to ⚪ MINIMAL
4. **Preserve Intent:** Never change what the user is asking for
5. **Show Changes:** Optionally explain key optimizations made

---

## Statistical Summary

**Total Patterns Tested:** 1,000
**Successful Completions:** 1,000 (100%)
**Failed Completions:** 0 (0%)

**Dimension Impact (by Confidence):**
1. outputSpec: 1.0 (Strong impact - JSON is 28.1% better than code_only)
2. structure: 0.291 (Moderate impact - few_shot is 8.9% better than chain_of_thought)
3. constraintStyle: 0.165 (Low-moderate impact - positive is 6.3% better than negative)
4. tone: 0.078 (Low impact - conversational is 3.2% better than formal)
5. contextPlacement: 0.063 (Minimal impact - none is 2.7% better than interleaved)
6. detail: 0.046 (Minimal impact - minimal is 2.1% better than moderate)

---

## Version History

- **v1.0** (2026-02-27): Initial release based on 1,000 pattern empirical testing

---

## License

This ruleset is derived from empirical testing and is provided for optimization purposes. Use freely to improve prompt engineering for Google Gemini Flash 3.
