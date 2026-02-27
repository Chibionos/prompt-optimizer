import type {
  StructureStyle,
  DetailLevel,
  ToneRegister,
  ContextPlacement,
  ConstraintStyle,
  OutputSpecification,
  PromptEngineeringPattern,
  PromptPattern,
} from '../types/index.js';
import type { DomainTask } from './domains.js';

/**
 * Renders a fully-assembled prompt string from a pattern's dimensional values.
 * This is the core "prompt compiler" -- it takes the structural axes and
 * a task, and produces the final prompt text that will be sent to the model.
 *
 * Two-phase rendering:
 * 1. Assemble the logical content (instruction, context, constraints, output spec)
 * 2. Encode it using the engineering pattern (XML, JSON, delimiters, etc.)
 */
export function renderPrompt(
  task: DomainTask,
  structure: StructureStyle,
  detail: DetailLevel,
  tone: ToneRegister,
  contextPlacement: ContextPlacement,
  constraintStyle: ConstraintStyle,
  outputSpec: OutputSpecification,
  engineeringPattern: PromptEngineeringPattern,
): string {
  // Phase 1: Build the logical blocks
  const tonePreamble = buildTonePreamble(tone);
  const contextBlock = buildContextBlock(task, detail);
  const constraintBlock = buildConstraintBlock(constraintStyle, task);
  const outputBlock = buildOutputBlock(outputSpec);
  const instruction = buildInstruction(structure, task, detail);

  // Phase 2: Assemble by context placement, then encode
  const sections: { label: string; content: string }[] = [];

  if (tonePreamble) sections.push({ label: 'preamble', content: tonePreamble });

  switch (contextPlacement) {
    case 'before_instruction':
      if (contextBlock) sections.push({ label: 'context', content: contextBlock });
      sections.push({ label: 'instruction', content: instruction });
      break;
    case 'after_instruction':
      sections.push({ label: 'instruction', content: instruction });
      if (contextBlock) sections.push({ label: 'context', content: contextBlock });
      break;
    case 'interleaved':
      sections.push({ label: 'instruction', content: interleaveContextAndInstruction(contextBlock, instruction) });
      break;
    case 'none':
      sections.push({ label: 'instruction', content: instruction });
      break;
  }

  if (constraintBlock) sections.push({ label: 'constraints', content: constraintBlock });
  if (outputBlock) sections.push({ label: 'output_format', content: outputBlock });

  // Phase 3: Apply engineering pattern encoding
  return applyEngineeringPattern(sections, engineeringPattern, task);
}

/**
 * Applies the prompt engineering pattern to format the assembled sections.
 * This is where we test whether the model respects XML, JSON, delimiters, etc.
 */
function applyEngineeringPattern(
  sections: { label: string; content: string }[],
  pattern: PromptEngineeringPattern,
  task: DomainTask,
): string {
  switch (pattern) {
    case 'plain_text':
      return sections.map(s => s.content).join('\n\n');

    case 'xml_blocks':
      return sections
        .map(s => `<${s.label}>\n${s.content}\n</${s.label}>`)
        .join('\n\n');

    case 'json_config': {
      const obj: Record<string, string> = {};
      for (const s of sections) {
        obj[s.label] = s.content;
      }
      return '```json\n' + JSON.stringify(obj, null, 2) + '\n```\n\nFollow the instructions in the JSON above exactly.';
    }

    case 'markdown_sections':
      return sections
        .map(s => `## ${s.label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${s.content}`)
        .join('\n\n');

    case 'triple_backtick_fenced':
      return sections
        .map(s => `[${s.label.toUpperCase()}]\n\`\`\`\n${s.content}\n\`\`\``)
        .join('\n\n');

    case 'numbered_priority':
      return sections
        .map((s, i) => `[PRIORITY ${i + 1}] ${s.label.toUpperCase()}\n${s.content}`)
        .join('\n\n');

    case 'key_value_pairs':
      return sections
        .map(s => `${s.label.toUpperCase()}: ${s.content.replace(/\n/g, '\n  ')}`)
        .join('\n\n');

    case 'nested_xml':
      return (
        `<task domain="${task.domain}" complexity="${task.complexity}">\n` +
        sections
          .map(s => `  <${s.label}>\n${s.content.split('\n').map(l => '    ' + l).join('\n')}\n  </${s.label}>`)
          .join('\n') +
        '\n</task>'
      );

    case 'system_user_separation': {
      const systemParts = sections.filter(s => s.label === 'constraints' || s.label === 'output_format' || s.label === 'preamble');
      const userParts = sections.filter(s => s.label === 'instruction' || s.label === 'context');
      const systemBlock = systemParts.length > 0
        ? `[SYSTEM]\n${systemParts.map(s => s.content).join('\n')}\n[/SYSTEM]`
        : '';
      const userBlock = `[USER]\n${userParts.map(s => s.content).join('\n\n')}\n[/USER]`;
      return [systemBlock, userBlock].filter(Boolean).join('\n\n');
    }

    case 'delimiter_separated':
      return sections
        .map(s => s.content)
        .join('\n\n---\n\n');
  }
}

function buildTonePreamble(tone: ToneRegister): string {
  switch (tone) {
    case 'formal':
      return '';
    case 'casual':
      return 'Hey, I need some help with something.';
    case 'technical':
      return '';
    case 'conversational':
      return 'I was thinking about something and wanted your take on it.';
  }
}

function buildContextBlock(task: DomainTask, detail: DetailLevel): string | null {
  if (detail === 'minimal') return null;

  const parts: string[] = [];

  if (task.context) {
    parts.push(`Context: ${task.context}`);
  }

  if (detail === 'verbose') {
    parts.push(`Domain: ${task.domain}`);
    parts.push(`This task is ${task.complexity} in nature.`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

function buildConstraintBlock(style: ConstraintStyle, task: DomainTask): string | null {
  // Generate constraints relevant to the task
  const constraints = getTaskConstraints(task);
  if (constraints.length === 0 || style === 'none') return null;

  switch (style) {
    case 'inline':
      return `Make sure that ${constraints.join(', and that ')}.`;
    case 'bulleted':
      return `Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}`;
    case 'negative':
      return constraints.map(c => `Do NOT ${invertConstraint(c)}.`).join('\n');
    case 'positive':
      return constraints.map(c => `Ensure that ${c}.`).join('\n');
    default:
      return null;
  }
}

function buildOutputBlock(spec: OutputSpecification): string | null {
  switch (spec) {
    case 'free_form':
      return null;
    case 'json':
      return 'Return your response as valid JSON.';
    case 'markdown':
      return 'Format your response using Markdown with appropriate headers and lists.';
    case 'structured_template':
      return 'Use this format:\n\n## Title\n[title]\n\n## Summary\n[summary]\n\n## Details\n[details]\n\n## Next Steps\n[next steps]';
    case 'code_only':
      return 'Return only code. No explanations, no comments outside the code.';
  }
}

function buildInstruction(
  structure: StructureStyle,
  task: DomainTask,
  detail: DetailLevel,
): string {
  const taskDesc = task.task;

  switch (structure) {
    case 'imperative':
      return detail === 'minimal'
        ? `${taskDesc}.`
        : `${taskDesc}. Be thorough and precise.`;

    case 'interrogative':
      return detail === 'minimal'
        ? `How would you ${taskDesc.toLowerCase()}?`
        : `Can you help me understand the best approach to ${taskDesc.toLowerCase()}? Walk me through your reasoning.`;

    case 'conditional':
      return `If the goal is to ${taskDesc.toLowerCase()}, what steps should be taken? If there are common pitfalls, address those as well.`;

    case 'enumerated':
      return detail === 'minimal'
        ? `${taskDesc}. List the steps numerically.`
        : `${taskDesc}.\n\nBreak your response into numbered steps:\n1. First, ...\n2. Then, ...\n3. Finally, ...`;

    case 'role_play':
      return `You are a world-class expert in ${task.domain}. A client has asked you to ${taskDesc.toLowerCase()}. Provide your professional response.`;

    case 'chain_of_thought':
      return `I need to ${taskDesc.toLowerCase()}. Think through this step by step, showing your reasoning at each stage before giving your final answer.`;

    case 'few_shot':
      return buildFewShotInstruction(task);

    case 'constraint_first':
      return `Given the following requirements, ${taskDesc.toLowerCase()}:\n- Must be actionable\n- Must be specific, not generic\n- Must be grounded in real-world applicability`;

    case 'output_template':
      return `${taskDesc}.\n\nStructure your answer as:\n**Approach**: [your approach]\n**Steps**: [step-by-step]\n**Result**: [expected outcome]`;

    case 'decomposed':
      return `To ${taskDesc.toLowerCase()}, complete these sub-tasks:\nSub-task A: Identify the key components involved.\nSub-task B: Analyze each component.\nSub-task C: Synthesize into a final recommendation.`;
  }
}

function buildFewShotInstruction(task: DomainTask): string {
  // Generate a simple example pattern
  const example = getFewShotExample(task.domain);
  return `Here's an example of what I'm looking for:\n\nExample task: ${example.task}\nExample response: ${example.response}\n\nNow, using a similar approach: ${task.task}`;
}

function interleaveContextAndInstruction(
  context: string | null,
  instruction: string,
): string {
  if (!context) return instruction;
  const contextLines = context.split('\n');
  const instrLines = instruction.split('\n');

  // Simple interleave: context line, instruction line, repeat
  const result: string[] = [];
  const maxLen = Math.max(contextLines.length, instrLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < contextLines.length) result.push(contextLines[i]);
    if (i < instrLines.length) result.push(instrLines[i]);
  }
  return result.join('\n');
}

function getTaskConstraints(task: DomainTask): string[] {
  const base = [
    'the response is accurate and factual',
    'the answer is complete and addresses all parts',
  ];

  const domainSpecific: Record<string, string[]> = {
    finance: ['numbers and calculations are correct', 'no specific investment advice is given without disclaimers'],
    health: ['medical disclaimers are included where appropriate', 'evidence-based sources are preferred'],
    code: ['the code is syntactically correct', 'edge cases are considered'],
    writing: ['the tone matches the intended audience', 'grammar and spelling are correct'],
    data: ['statistical claims are justified', 'methodology is sound'],
    legal: ['legal disclaimers are included', 'jurisdiction-specific notes are mentioned'],
    education: ['the explanation is age-appropriate', 'concepts build on each other logically'],
    project_mgmt: ['deliverables are specific and measurable', 'timelines are realistic'],
    creative: ['the output is original and not generic', 'the creative brief constraints are followed'],
    science: ['claims are backed by evidence', 'uncertainty is acknowledged where appropriate'],
    practical: ['steps are in the correct order', 'safety warnings are included where relevant'],
    negotiation: ['the tone remains professional', 'alternatives and BATNA are considered'],
    ethics: ['multiple perspectives are represented', 'reasoning is transparent'],
    marketing: ['the target audience is clearly addressed', 'claims are substantiated'],
    debugging: ['root causes are identified before solutions', 'diagnostic steps are ordered by likelihood'],
    career: ['advice is actionable and specific', 'industry context is considered'],
    devops: ['security best practices are followed', 'configurations are production-ready'],
    psychology: ['scientific backing is referenced', 'practical applications are included'],
    product: ['user needs drive the design', 'accessibility is considered'],
  };

  const extra = domainSpecific[task.domain] || [];
  return task.complexity === 'easy' ? base.slice(0, 1) : [...base, ...extra.slice(0, 1)];
}

function invertConstraint(constraint: string): string {
  // Map each constraint to its negated phrasing
  const negations: [RegExp, string][] = [
    [/^the response is (.+)$/, 'provide a response that is not $1'],
    [/^the answer is (.+)$/, 'give an answer that is not $1'],
    [/^the code is (.+)$/, 'write code that is not $1'],
    [/^(.+) are (.+)$/, 'let $1 be $2 without verification'],
    [/^(.+) is (.+)$/, 'skip ensuring $1 is $2'],
  ];

  for (const [pattern, replacement] of negations) {
    if (pattern.test(constraint)) {
      return constraint.replace(pattern, replacement);
    }
  }

  // Fallback: wrap with "skip" phrasing
  return `skip: ${constraint}`;
}

function getFewShotExample(domain: string): { task: string; response: string } {
  const examples: Record<string, { task: string; response: string }> = {
    finance: {
      task: 'Explain what an emergency fund is',
      response: 'An emergency fund is 3-6 months of living expenses saved in a liquid account for unexpected costs like medical bills or job loss.',
    },
    health: {
      task: 'Define BMI',
      response: 'BMI (Body Mass Index) is weight in kg divided by height in meters squared. It\'s a screening tool, not a diagnostic measure.',
    },
    code: {
      task: 'Write a function to reverse a string',
      response: 'function reverse(s) { return s.split("").reverse().join(""); }',
    },
    writing: {
      task: 'Write a thank-you note',
      response: 'Dear [Name], Thank you for [specific thing]. Your generosity/support meant a great deal. Warm regards, [Your name]',
    },
    education: {
      task: 'Explain gravity to a child',
      response: 'Gravity is like an invisible pull that the Earth has. It keeps your feet on the ground and makes a ball come back down when you throw it up.',
    },
    legal: {
      task: 'What is a contract?',
      response: 'A contract is a legally binding agreement between two or more parties. It requires an offer, acceptance, consideration, and mutual intent to be enforceable.',
    },
    data: {
      task: 'What is an average?',
      response: 'An average (mean) is the sum of all values divided by the count. For [2, 4, 6]: (2+4+6)/3 = 4.',
    },
    project_mgmt: {
      task: 'What is a user story?',
      response: 'A user story follows the format: "As a [role], I want [feature], so that [benefit]." Example: "As a user, I want to reset my password, so that I can regain access to my account."',
    },
    creative: {
      task: 'Write a one-line tagline for a coffee shop',
      response: 'Wake up to what matters.',
    },
    science: {
      task: 'What is photosynthesis?',
      response: 'Photosynthesis is the process by which plants convert sunlight, water, and CO2 into glucose and oxygen, using chlorophyll in their leaves.',
    },
    practical: {
      task: 'How to boil an egg',
      response: 'Place eggs in a pot, cover with cold water by 1 inch. Bring to a boil, remove from heat, cover, and let sit 10 minutes. Transfer to ice water.',
    },
    negotiation: {
      task: 'How to ask for a raise',
      response: 'Schedule a meeting, present your accomplishments with metrics, reference market rates, state your desired salary, and be prepared to discuss a timeline.',
    },
    ethics: {
      task: 'What is a conflict of interest?',
      response: 'A conflict of interest occurs when personal interests could compromise professional judgment. Example: a hiring manager interviewing their relative for a position.',
    },
    marketing: {
      task: 'Write a call to action',
      response: 'Start your free trial today — no credit card required.',
    },
    debugging: {
      task: 'What does a 404 error mean?',
      response: 'A 404 error means the server cannot find the requested resource. Common causes: wrong URL, deleted page, or broken link.',
    },
    career: {
      task: 'How to prepare for an interview',
      response: 'Research the company, review the job description, prepare STAR-format answers for behavioral questions, and prepare 3 questions to ask the interviewer.',
    },
    devops: {
      task: 'What is a container?',
      response: 'A container is a lightweight, standalone package of software that includes code, runtime, libraries, and settings. It runs consistently across environments.',
    },
    psychology: {
      task: 'What is confirmation bias?',
      response: 'Confirmation bias is the tendency to search for and favor information that confirms existing beliefs while ignoring contradictory evidence.',
    },
    product: {
      task: 'What is a wireframe?',
      response: 'A wireframe is a low-fidelity visual guide showing the skeletal structure of a page — layout, content placement, and functionality without design details.',
    },
    default: {
      task: 'Summarize a concept briefly',
      response: 'A brief, clear explanation covering the what, why, and how in 2-3 sentences.',
    },
  };
  return examples[domain] || examples['default'];
}
