import { renderEdgeLine, renderNodeLine, type CanvasGraph } from '@sysdesign/contracts';

/** Whole-section ceiling; a 100-node canvas sits comfortably inside it. */
export const CANVAS_TEXT_MAX_CHARS = 16_000;

/**
 * The design, as the suggester shows it to a model.
 *
 * Deliberately smaller than the eval worker's document: that one carries scale
 * targets, every NFR spec and the token budget three passes share, because a
 * critic is judging the design against the prompt. This is asking a narrower
 * question — which of these boxes holds which promise — so it carries the boxes
 * and nothing else, and the requirements are laid out separately by the caller.
 *
 * The node and edge lines themselves come from contracts, so a component reads
 * identically here and in the critic's prompt.
 */
export function describeCanvas(graph: CanvasGraph): string {
  const text = [
    '# The design (canvas graph)',
    ...graph.nodes.map(renderNodeLine),
    ...graph.edges.map(renderEdgeLine),
  ].join('\n');

  return text.length > CANVAS_TEXT_MAX_CHARS
    ? `${text.slice(0, CANVAS_TEXT_MAX_CHARS)}\n  […design clipped for length]`
    : text;
}
