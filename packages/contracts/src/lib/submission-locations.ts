import type { DesignSubmission } from './canvas.schema';

/**
 * Every addressable part of a submission, numbered by position — the one
 * numbering the canvas pipeline's `locate` prints for its lenses and the
 * studio joins a finding's refs back onto the stored revision with. Arrays
 * are numbered UNFILTERED, so `binding.3` is the third binding whatever it
 * says; the label is what a reader sees, and `key` is the author's own id
 * (a node id, an edge id, a criterion id) so a consumer can highlight the
 * part without parsing the label.
 */
export const SUBMISSION_PARTS = [
  'node',
  'edge',
  'binding',
  'overview',
  'rationale',
  'narration',
] as const;
export type SubmissionPart = (typeof SUBMISSION_PARTS)[number];

export interface SubmissionLocation {
  /** Positional: `node.N`, `edge.N`, `binding.N`, `overview`, `rationale.N`, `narration.N`. */
  id: string;
  label: string;
  part: SubmissionPart;
  /** The author's own id for the part; null for the overview, which has none. */
  key: string | null;
}

const numbered = <I>(
  part: SubmissionPart,
  items: readonly I[],
  label: (item: I) => string,
  key: (item: I) => string,
): SubmissionLocation[] =>
  items.map((item, index) => ({
    id: `${part}.${index + 1}`,
    label: label(item),
    part,
    key: key(item),
  }));

export function submissionLocations(submission: DesignSubmission): SubmissionLocation[] {
  const { graph, brief, narrative } = submission;
  const overview = narrative?.overview?.trim() ?? '';
  return [
    ...numbered(
      'node',
      graph.nodes,
      (node) => `${node.id} · ${node.kind} · ${node.label}`,
      (node) => node.id,
    ),
    ...numbered(
      'edge',
      graph.edges,
      (edge) => `${edge.id} · ${edge.source} → ${edge.target} (${edge.kind})`,
      (edge) => edge.id,
    ),
    ...numbered(
      'binding',
      brief?.bindings ?? [],
      (binding) => `${binding.criterionId} ← ${binding.nodeIds.join(', ')}`,
      (binding) => binding.criterionId,
    ),
    ...(overview.length > 0
      ? [{ id: 'overview', label: 'Overview', part: 'overview' as const, key: null }]
      : []),
    ...numbered(
      'rationale',
      narrative?.componentRationales ?? [],
      (item) => item.nodeId,
      (item) => item.nodeId,
    ),
    ...numbered(
      'narration',
      narrative?.criterionNarrations ?? [],
      (item) => item.criterionId,
      (item) => item.criterionId,
    ),
  ];
}
