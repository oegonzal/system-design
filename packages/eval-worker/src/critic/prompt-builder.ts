import type { CriticInput } from './eval-critic';

export const CRITIC_SYSTEM_PROMPT = [
  'You are a principal engineer reviewing a system-design exercise on an',
  'architecture canvas. Your job is to teach: point out what the deterministic',
  'rule engine cannot see — misplaced responsibilities, missing failure',
  'stories, consistency traps, operational blind spots — grounded in the',
  "prompt's stated scale. Be concrete and reference node ids. Never restate a",
  'finding the rule engine already made. If the design is genuinely sound,',
  'return no findings and say so in the summary.',
].join(' ');

/**
 * Compact, deterministic text rendering of the canvas + prompt + what the
 * engine already found. Line-oriented so the model can quote node ids
 * verbatim.
 */
export function buildCriticUserPrompt({
  graph,
  facts,
  deterministicFindings,
}: CriticInput): string {
  const nodes = graph.nodes.map((node) => {
    const config = node.config ? ` config=${JSON.stringify(node.config)}` : '';
    return `  node ${node.id} kind=${node.kind} label=${JSON.stringify(node.label)}${config}`;
  });

  const edges = graph.edges.map(
    (edge) =>
      `  edge ${edge.id}: ${edge.source} -> ${edge.target} (${edge.kind ?? 'sync'})${
        edge.label ? ` label=${JSON.stringify(edge.label)}` : ''
      }`,
  );

  const alreadyFound =
    deterministicFindings.length === 0
      ? '  (none)'
      : deterministicFindings.map((f) => `  [${f.severity}] ${f.ruleId}: ${f.title}`).join('\n');

  const targets = facts.scaleTargets;

  return [
    `# Design prompt`,
    `archetype: ${facts.archetype} · difficulty: ${facts.difficulty}`,
    `scale: ${targets.concurrentUsers} concurrent users, ${targets.requestsPerSecond} req/s, ` +
      `read:write ${targets.readWriteRatio}, p99 ≤ ${targets.p99LatencyMs}ms, ` +
      `availability ${targets.availabilityPct}%`,
    `functional requirements: ${facts.functionalText}`,
    ``,
    `# Candidate design (canvas graph)`,
    ...nodes,
    ...edges,
    ``,
    `# Already found by the rule engine (do not repeat)`,
    alreadyFound,
  ].join('\n');
}
