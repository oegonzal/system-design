/**
 * How memory reaches a target's goal, and how it is taken off again: one
 * advisory section under a marker heading, appended within the engine's goal
 * budget. `bareGoal` strips at the marker, so nothing parses prose.
 */
import { GOAL_BUDGET_BYTES } from '@sysdesign/contracts';
import { lessonOf } from './provenance';
import type { UsableMemory } from './read-pack';

/** The marker the loop writes; `bareGoal` strips from it. */
export const MEMORY_HEADING = '## Remembered evidence (advisory)';
const MEMORY_LEAD =
  'Recalled from earlier runs by the memory loop and curated by the memory-recall pipeline. Context for the answer, not part of the prompt above: it states no requirement, and no success criterion may be derived from it. Prefer the prompt wherever they differ.';

/** The goal as requested, without any memory a previous memory run appended. */
export function bareGoal(goal: string): string {
  const marker = goal.indexOf(`\n\n${MEMORY_HEADING}`);
  return marker < 0 ? goal : goal.slice(0, marker);
}

/**
 * One remembered item: where it was learned, the stored lesson verbatim, and
 * the curator's words read back in the target's own terms (`lessonOf`) — the
 * labels its query gave the target's needs mean nothing in the target's goal,
 * and its own criterion ids would read as the target's — each part it named
 * only by such labels left unsaid.
 */
const rememberedLine = (usable: UsableMemory): string => {
  const { source } = usable.hit;
  const { ref, text, serves, insight, caveat } = lessonOf(usable);
  const said = [
    ...(serves ? [`serves: ${serves}`] : []),
    ...(insight ? [`insight: ${insight}`] : []),
    ...(caveat ? [`caveat: ${caveat}`] : []),
  ];
  return `- [${ref}] ${source.kind} · run ${source.runId} · ${source.pipeline} · iteration ${source.iteration} · decided ${source.decision} · ${source.when} · ref ${source.ref}: ${text}${said.length > 0 ? ` — ${said.join('; ')}` : ''}`;
};

/**
 * The goal with memory appended, within the engine's goal budget: the
 * lowest-ranked items go first when it does not fit; a goal already at the
 * budget gets none. Null when nothing could be injected.
 */
export function withMemory(
  goal: string,
  usable: readonly UsableMemory[],
  budget = GOAL_BUDGET_BYTES,
): { goal: string; injected: number } | null {
  const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');
  if (usable.length === 0 || bytes(goal) >= budget) return null;
  for (let count = usable.length; count > 0; count -= 1) {
    const composed = [
      goal.trimEnd(),
      '',
      MEMORY_HEADING,
      '',
      MEMORY_LEAD,
      '',
      ...usable.slice(0, count).map(rememberedLine),
    ].join('\n');
    if (bytes(composed) <= budget) return { goal: composed, injected: count };
  }
  return null;
}
