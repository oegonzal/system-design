import type { DesignSubmission } from './canvas.schema';
import { nodeLabel } from './node-label';
import { joinMention, refIdsIn, replaceRefs, writtenBeside } from './prose-refs';

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
 * read as the criterion or the node itself. `name` is what the author calls
 * the part, where a part has a name beyond its ids — a node's label — so a
 * reader can tell when a sentence has already said it.
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
  /** What the author calls the part — a node's label; null for a part with no name of its own. */
  name: string | null;
}

const numbered = <I>(
  part: SubmissionPart,
  items: readonly I[],
  label: (item: I) => string,
  key: (item: I) => string,
  name: (item: I) => string | null = () => null,
): SubmissionLocation[] =>
  items.map((item, index) => ({
    id: `${part}.${index + 1}`,
    label: label(item),
    part,
    key: key(item),
    name: name(item),
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
      nodeLabel,
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
      ? [{ id: 'overview', label: 'Overview', part: 'overview' as const, key: null, name: null }]
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

/** The ids of `locations` that `prose` names, in the order it first names them — the grammar is `prose-refs`'. */
export function locationIdsIn(prose: string, locations: readonly { id: string }[]): string[] {
  return refIdsIn(
    prose,
    locations.map((location) => location.id),
  );
}

/** A place as a reader is shown it: the positional ref a lens cited, joined back onto the submission. */
export interface LocatedRef {
  /** The positional id the lens cited, verbatim: `node.3`, `binding.1`, `overview`, … */
  ref: string;
  label: string;
  part: SubmissionPart;
  /** The author's own id for the part — a node id, an edge id, a criterion id; null for the overview. */
  key: string | null;
  /** What the author calls the part — a node's label; absent for a part with no name of its own. */
  name?: string;
}

/**
 * A place's label for a sentence that has already said what the part is: the
 * author's key alone for a drawn part, the key and the part's kind for a
 * written one. Total over the parts, so a new part states its short form
 * where it is declared.
 */
const SHORT_LABEL = {
  node: ({ key, label }) => key ?? label,
  edge: ({ key, label }) => key ?? label,
  binding: ({ key, label }) => (key === null ? label : `${key} binding`),
  overview: ({ label }) => label,
  rationale: ({ key, label }) => (key === null ? label : `${key} rationale`),
  narration: ({ label }) => label,
} as const satisfies Record<
  SubmissionPart,
  (location: Pick<LocatedRef, 'key' | 'label'>) => string
>;

export const shortLocationLabel = (location: Pick<LocatedRef, 'part' | 'key' | 'label'>): string =>
  SHORT_LABEL[location.part](location);

/**
 * A lens's prose with every place it cites — in either case, runs and lists
 * included — replaced by that place's label, so the author reads "Orders DB"
 * where the model wrote a position. A place gets its full label the first
 * time the prose reaches it and its short one after that, and its short one
 * from the start where the prose names the part right beside the ref —
 * "Orders DB (node.5)" reads "Orders DB (n-5)", never the name twice. A ref
 * `locations` does not hold is left as written.
 */
export function substituteLocationRefs(prose: string, locations: readonly LocatedRef[]): string {
  const byRef = new Map(locations.map((location) => [location.ref, location]));
  const introduced = new Set<string>();
  return replaceRefs(prose, [...byRef.keys()], (mention) => {
    const end = mention.index + mention.text.length;
    return joinMention(mention, (ref) => {
      const location = byRef.get(ref);
      if (location === undefined) return ref;
      const said =
        introduced.has(ref) ||
        (location.name !== undefined && writtenBeside(prose, mention.index, end, location.name));
      introduced.add(ref);
      return said ? shortLocationLabel(location) : location.label;
    });
  });
}
