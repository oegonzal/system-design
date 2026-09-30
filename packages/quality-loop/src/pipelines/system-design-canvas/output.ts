/**
 * The studio's canvas as an artifact: the diagram the author drew, the brief
 * that binds each criterion to the components holding it (and, where a
 * request travels, the path of edges), and the narrative keyed to nodes and
 * criteria. The schema is the one in `@sysdesign/contracts` — the studio API
 * validates a submission with it and the coach writes into it — so there is
 * nothing here to drift.
 *
 * Location ids are positional (`node.3`, `binding.1`), never the author's own
 * canvas ids: a lens may cite only what the render printed, and the render
 * prints the author's id beside every positional one so a reader can join
 * them. The studio maps `node.N` / `edge.N` back by array position.
 */
import {
  designSubmissionSchema,
  renderEdgeLine,
  renderNodeLine,
  type DesignSubmission,
} from '@sysdesign/contracts';

import { numbered, type OutputShape } from '../../core/contracts';

export type CanvasSubmission = DesignSubmission;

/** `n-7 (node.3)` — the author's id with the positional id a lens must cite. */
function positional<I extends { id: string }>(items: readonly I[], prefix: string) {
  const byId = new Map(items.map((item, index) => [item.id, `${prefix}.${index + 1}`]));
  return (id: string): string => {
    const position = byId.get(id);
    return position === undefined ? id : `${id} (${position})`;
  };
}

export const canvasOutput: OutputShape<CanvasSubmission> = {
  schema: designSubmissionSchema,

  locate: (submission) => {
    const { graph, brief, narrative } = submission;
    const overview = narrative?.overview?.trim() ?? '';
    return [
      ...numbered('node', graph.nodes, (node) => `${node.id} · ${node.kind} · ${node.label}`),
      ...numbered(
        'edge',
        graph.edges,
        (edge) => `${edge.id} · ${edge.source} → ${edge.target} (${edge.kind})`,
      ),
      ...numbered(
        'binding',
        brief?.bindings ?? [],
        (binding) => `${binding.criterionId} ← ${binding.nodeIds.join(', ')}`,
      ),
      ...(overview.length > 0 ? [{ id: 'overview', label: 'Overview' }] : []),
      ...numbered('rationale', narrative?.componentRationales ?? [], (item) => item.nodeId),
      ...numbered('narration', narrative?.criterionNarrations ?? [], (item) => item.criterionId),
    ];
  },

  render: (submission) => {
    const { graph, brief, narrative } = submission;
    const node = positional(graph.nodes, 'node');
    const edge = positional(graph.edges, 'edge');
    const overview = narrative?.overview?.trim() ?? '';
    const lines: string[] = [
      'Cite parts by the bracketed ids. The token after each bracket is the author’s own canvas id; the brief and narrative refer to those.',
      '',
      '## Nodes',
      ...graph.nodes.map((item, index) => `[node.${index + 1}] ${renderNodeLine(item).trim()}`),
      '',
      '## Edges',
      ...graph.edges.map((item, index) => `[edge.${index + 1}] ${renderEdgeLine(item).trim()}`),
      '',
      '## Brief',
    ];
    if (brief === null || brief.bindings.length === 0) {
      lines.push('(none submitted)');
    } else {
      lines.push(
        ...brief.bindings.map((binding, index) => {
          const path =
            binding.path !== undefined && binding.path.length > 0
              ? ` · path ${binding.path.map(edge).join(' → ')}`
              : '';
          return `[binding.${index + 1}] ${binding.criterionId} ← ${binding.nodeIds.map(node).join(', ')}${path}: ${JSON.stringify(binding.claim)}`;
        }),
      );
    }
    lines.push('', '## Narrative');
    if (
      narrative === null ||
      (overview.length === 0 &&
        narrative.componentRationales.length === 0 &&
        narrative.criterionNarrations.length === 0)
    ) {
      lines.push('(none submitted)');
    } else {
      if (overview.length > 0) lines.push(`[overview] ${overview}`);
      lines.push(
        ...narrative.componentRationales.map(
          (item, index) => `[rationale.${index + 1}] ${node(item.nodeId)}: ${item.prose}`,
        ),
        ...narrative.criterionNarrations.map(
          (item, index) => `[narration.${index + 1}] ${item.criterionId}: ${item.prose}`,
        ),
      );
    }
    return lines.join('\n');
  },
};
