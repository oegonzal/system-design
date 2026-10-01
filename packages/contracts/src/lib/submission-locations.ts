import type { DesignSubmission } from './canvas.schema';
import { nodeLabel } from './node-label';

/**
 * Every addressable part of a submission, numbered by position — the one
 * numbering the canvas pipeline's `locate` prints for its lenses and the
 * studio joins a finding's refs back onto the stored revision with. Arrays
 * are numbered UNFILTERED, so `binding.3` is the third binding whatever it
 * says; the label is what a reader sees, and `key` is the author's own id
 * (a node id, an edge id, a criterion id) so a consumer can highlight the
 * part without parsing the label. A label names its part — "c1 binding
 * (n-2)", "Orders API rationale (n-2)", "c1 narration" — because a reader
 * meets it substituted into a lens's prose, where a bare `c1` or `n-2` would
 * read as the criterion or the node itself.
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
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  /** A rationale names the node it explains — by its label when the node is drawn. */
  const explained = (nodeId: string): string => {
    const node = nodes.get(nodeId);
    return node ? `${nodeLabel(node)} rationale (${nodeId})` : `${nodeId} rationale`;
  };
  return [
    ...numbered(
      'node',
      graph.nodes,
      (node) => `${node.id} · ${node.kind} · ${nodeLabel(node)}`,
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
      (binding) =>
        binding.nodeIds.length > 0
          ? `${binding.criterionId} binding (${binding.nodeIds.join(', ')})`
          : `${binding.criterionId} binding`,
      (binding) => binding.criterionId,
    ),
    ...(overview.length > 0
      ? [{ id: 'overview', label: 'Overview', part: 'overview' as const, key: null }]
      : []),
    ...numbered(
      'rationale',
      narrative?.componentRationales ?? [],
      (item) => explained(item.nodeId),
      (item) => item.nodeId,
    ),
    ...numbered(
      'narration',
      narrative?.criterionNarrations ?? [],
      (item) => `${item.criterionId} narration`,
      (item) => item.criterionId,
    ),
  ];
}

const escapeRegExp = (literal: string): string => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A global pattern matching any of `ids` as a whole token — longest first, so
 * a listed `node.1` never matches inside the `node.12` beside it. Matching is
 * against the ids a submission actually has, never a guess at what looks
 * like one. Null when there is nothing to match.
 */
export function locationRefPattern(ids: readonly string[]): RegExp | null {
  if (ids.length === 0) return null;
  const alternatives = [...new Set(ids)].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`\\b(?:${alternatives.join('|')})(?!\\w)`, 'g');
}

/** The ids of `locations` that `prose` names, in the order it first names them. */
export function locationIdsIn(prose: string, locations: readonly { id: string }[]): string[] {
  const pattern = locationRefPattern(locations.map((location) => location.id));
  if (pattern === null) return [];
  return [...new Set(Array.from(prose.matchAll(pattern), (match) => match[0]))];
}
