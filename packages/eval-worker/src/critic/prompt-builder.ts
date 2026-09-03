import { describeDesign } from '../engine/serialization/graph-text';
import type { CriticInput } from './eval-critic';

export const CRITIC_SYSTEM_PROMPT = [
  'You are a principal engineer reviewing a system-design exercise on an',
  'architecture canvas. Your job is to find WEAKNESSES the deterministic rule',
  'engine cannot see — misplaced responsibilities, missing failure stories,',
  'consistency traps, operational blind spots — and report each as grounded,',
  'gradeable evidence, not loose commentary.',
  'For each weakness answer, in order: WHERE it is (name the requirement it',
  'undermines — an NFR or workflow item id from the prompt — and the affected',
  'node ids), HOW BAD it is (a `weakness` magnitude of none/low/medium/high at',
  "the prompt's stated scale), HOW SURE you are (`confidence`), and WHY (the",
  'rationale, tied to that requirement). Ground every weakness to a requirement',
  'the prompt actually made; use a null requirement only when the weakness is',
  'genuinely cross-cutting. Be honest with the magnitude — reserve high for a',
  'weakness that would actually hurt in production, and none for a nit.',
  'Never restate a finding the rule engine already made; if the design is',
  'genuinely sound, return no findings and say so in the summary.',
  "Declared responsibilities, operations and carries are the author's",
  'interface contracts — critique missing, misplaced or leaky responsibilities',
  'against them. When operations are declared, also judge the API design itself',
  '— operation granularity, naming clarity, kind fit, idempotency choices, and',
  'how tightly callers couple to each surface.',
  'A submitted design narrative is context, not your subject — a dedicated',
  'narrative critic cross-examines the story against the diagram, so leave',
  'story-diagram alignment to it.',
].join(' ');

/**
 * The shared design document plus the critic's own dedup section: everything
 * the deterministic passes already found, so the model adds rather than
 * repeats.
 */
export function buildCriticUserPrompt({
  graph,
  facts,
  narrative,
  deterministicFindings,
}: CriticInput): string {
  const alreadyFound =
    deterministicFindings.length === 0
      ? '  (none)'
      : deterministicFindings
          .map((f) => `  [${f.severity}] ${f.ruleId ?? f.expectationId ?? 'finding'}: ${f.title}`)
          .join('\n');

  return [
    describeDesign(graph, facts, narrative).text,
    ``,
    `# Already found by the rule engine (do not repeat)`,
    alreadyFound,
  ].join('\n');
}
