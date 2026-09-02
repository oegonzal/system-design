import type { CanvasGraph } from './canvas';
import type { DesignNarrative } from './narration';

/** The slice of the prompt a narrative's flow slots must line up with. */
export interface NarrationPromptRefs {
  functionalRequirements: readonly string[];
}

/**
 * Referential validation of a narrative whose *shape* already passed the DTO
 * layer. Pure and total, like `validateBriefReferences` — every problem in one
 * 422 rather than one per round trip.
 *
 * The same line the brief validator holds: it rejects claims that are
 * IMPOSSIBLE — a rationale for a node that is not on the canvas, a flow
 * narration for a requirement the prompt never posed — and says nothing about
 * prose that is merely thin. A two-word rationale is a save that grades poorly,
 * not a save the API refuses; refusing it would move the teaching out of the
 * evaluation and into a form validator.
 */
export function validateNarration(
  graph: CanvasGraph,
  narrative: DesignNarrative,
  prompt: NarrationPromptRefs,
): string[] {
  const problems: string[] = [];

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const seenNodes = new Set<string>();
  for (const rationale of narrative.componentRationales) {
    if (!nodeIds.has(rationale.nodeId)) {
      problems.push(`narrative explains unknown node: ${rationale.nodeId}`);
      continue;
    }
    if (seenNodes.has(rationale.nodeId)) {
      problems.push(`narrative explains node ${rationale.nodeId} twice`);
    }
    seenNodes.add(rationale.nodeId);
  }

  const seenRequirements = new Set<number>();
  for (const flow of narrative.flowNarrations) {
    if (flow.requirementIndex >= prompt.functionalRequirements.length) {
      problems.push(
        `narrative narrates requirement #${flow.requirementIndex}, but the prompt has ${prompt.functionalRequirements.length}`,
      );
      continue;
    }
    if (seenRequirements.has(flow.requirementIndex)) {
      problems.push(`narrative narrates requirement #${flow.requirementIndex} twice`);
    }
    seenRequirements.add(flow.requirementIndex);
  }

  return problems;
}
