import { describeDesign } from '../engine/serialization/graph-text';
import type { CriticInput } from './eval-critic';

export const CRITIC_SYSTEM_PROMPT = [
  'You are a principal engineer reviewing a system-design exercise on an',
  'architecture canvas. Your job is to teach: point out what the deterministic',
  'rule engine cannot see — misplaced responsibilities, missing failure',
  'stories, consistency traps, operational blind spots — grounded in the',
  "prompt's stated scale. Be concrete and reference node ids. Never restate a",
  'finding the rule engine already made. If the design is genuinely sound,',
  'return no findings and say so in the summary.',
  "Declared responsibilities, operations and carries are the author's",
  'interface contracts — critique missing, misplaced or leaky responsibilities',
  "against them, never restating the rule engine's findings.",
  'When operations are declared, also judge the API design itself — operation',
  'granularity, naming clarity, kind fit, idempotency choices, and how tightly',
  'callers couple to each surface.',
].join(' ');

/**
 * The shared design document plus the critic's own dedup section: everything
 * the deterministic passes already found, so the model adds rather than
 * repeats.
 */
export function buildCriticUserPrompt({
  graph,
  facts,
  deterministicFindings,
}: CriticInput): string {
  const alreadyFound =
    deterministicFindings.length === 0
      ? '  (none)'
      : deterministicFindings
          .map((f) => `  [${f.severity}] ${f.ruleId ?? f.expectationId ?? 'finding'}: ${f.title}`)
          .join('\n');

  return [
    describeDesign(graph, facts).text,
    ``,
    `# Already found by the rule engine (do not repeat)`,
    alreadyFound,
  ].join('\n');
}
