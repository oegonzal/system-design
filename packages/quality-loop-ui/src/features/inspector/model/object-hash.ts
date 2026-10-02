import type { Remediation } from '@sysdesign/contracts';

import { subjectLabel } from '../../results/select';

/**
 * How an array element is identified across two states.
 *
 * Array diffing is the whole game here. Without identity, moving one finding up
 * a list reads as "every element after it changed"; with it, the list reads as
 * "this one was removed". The differ asks this function for an element's
 * identity — and it is asked with the element alone, never with the path it was
 * found at, so it cannot be a lookup by field name per array. It has to be a
 * probe table over field signatures instead: the first shape whose
 * discriminating fields are all present wins.
 *
 * Order therefore matters, and the order is the point. A penalty trace, a
 * discarded item and a confirmed finding all carry `key`, so the two more
 * specific shapes must be probed before the general one or every penalty would
 * be identified as the finding it priced.
 *
 * There are two shapes the client genuinely cannot know: a pipeline's own
 * artifact and an orchestrator's own step report. For an element of those the
 * fallback is position. The library's own `matchByPosition` option cannot
 * deliver it — once an `objectHash` is supplied, an element whose hash comes
 * back undefined is treated as matching nothing at all, so every element of an
 * unknown array would read as removed and re-added. The fallback therefore lives
 * *inside* the hash: an unrecognised element is identified by its index, which
 * matches position to position and nothing else.
 *
 * Note what `OPAQUE_PATHS` does and does not do. The differ asks for an identity
 * with no path, so these probes DO run inside those subtrees: an element of a
 * pipeline's artifact that happens to carry an `id` is identified by it, which is
 * usually right and occasionally lucky. `OPAQUE_PATHS` is therefore a labelling
 * fact for the reader — "this shape belongs to another layer" — and not a
 * boundary the differ enforces. The protection that matters is the coverage
 * walk, which asserts uniqueness inside those subtrees too.
 *
 * `identityOf` keeps the honest answer — `undefined` for a shape with no domain
 * identity — because a printed path should say `[3]` rather than pretend the
 * third element has a name.
 *
 * One more distinction, learned from real records rather than reasoned out: a
 * field signature identifies an element only where something GUARANTEES it is
 * unique. The engine's normalised output does — a confirmed finding's key is a
 * map key, a criterion appears once per rubric entry, a dimension once per
 * policy weight. **A model's own list guarantees nothing.** A critic really did
 * report two different defects with the same type and the same locations in one
 * sample (`topology_defect|edge.4,node.3,node.5`, twice, in a recorded run), and
 * two such elements sharing an identity is not a cosmetic problem: the differ
 * treats them as one element, so a change to one can be attributed to the other.
 *
 * So the three shapes a model authors are identified by their POSITION as well
 * as their fields. They never reorder — an iteration once recorded is final — so
 * position costs nothing and removes the collision.
 */

/**
 * The subtrees of the state whose shape belongs to a pipeline or an
 * orchestrator rather than to this client, declared as data.
 *
 * Nothing here can be given a domain identity without the UI learning a
 * pipeline's own vocabulary, which is exactly the coupling the engine's rules
 * forbid. They are diffed by position and labelled as another layer's shape.
 * A `*` stands for any one key.
 */
export const OPAQUE_PATHS = [
  'artifact.value',
  'orchestration.context',
  'orchestration.steps.*.report',
] as const satisfies readonly string[];

/** Whether a dotted path lies inside a declared opaque subtree. */
export function isOpaquePath(path: readonly string[]): boolean {
  return OPAQUE_PATHS.some((pattern) => {
    const parts = pattern.split('.');
    if (path.length < parts.length) return false;
    return parts.every((part, index) => part === '*' || part === path[index]);
  });
}

type Row = Record<string, unknown>;

/** One shape the client can identify, and how. */
export interface HashProbe {
  /** The contract type this probe recognises — documentation that the spec reads back. */
  shape: string;
  /** The fields whose presence together mean "this is that shape". */
  discriminators: readonly string[];
  hash: (row: Row) => string;
  /**
   * True for a list a MODEL authored, where nothing guarantees two elements
   * differ in the fields above. Such an element is identified by its position as
   * well, since that is the only thing that distinguishes it.
   */
  positional?: boolean;
}

const present = (row: Row, fields: readonly string[]): boolean =>
  fields.every((field) => row[field] !== undefined);

/** Order-insensitive identity for a set of refs — a finding is the same defect wherever listed. */
const refs = (value: unknown): string =>
  Array.isArray(value) ? [...(value as unknown[])].map(String).sort().join(',') : String(value);

/**
 * The table, most specific first. Every array in `InspectorState` is covered by
 * exactly one of these or holds primitives only, which a spec walks the state
 * to prove rather than take on trust.
 */
export const HASH_PROBES: readonly HashProbe[] = [
  {
    // Keyed by the finding it priced, NOT by its rank. `position` is the
    // element's own 0-based place in the dimension's list and is recomputed each
    // iteration, so including it made a penalty that survived a revision read as
    // removed and re-added — and hid the one thing worth seeing, that its decay
    // multiplier moved because something above it went away.
    shape: 'PenaltyTrace',
    discriminators: ['key', 'position'],
    hash: (row) => `penalty:${String(row['key'])}`,
  },
  {
    shape: 'DiscardedItem',
    discriminators: ['lens', 'key'],
    hash: (row) => `discarded:${String(row['lens'])}|${String(row['key'])}`,
  },
  {
    shape: 'ConfirmedFinding',
    discriminators: ['key'],
    hash: (row) => `finding:${String(row['key'])}`,
  },
  {
    // An evaluator's own list. Only this shape carries a rationale, which is
    // what separates it from the engine's two criterion shapes below — and it
    // needs separating, because nothing stops a model judging one criterion
    // twice in a single reply.
    shape: 'RawCriterionResult',
    discriminators: ['criterionId', 'rationale'],
    positional: true,
    hash: (row) => `criterion:${String(row['criterionId'])}`,
  },
  {
    // The engine's own: one entry per rubric criterion, per dimension. The id
    // identifies it, which is what keeps a printed path pointing at `c2` rather
    // than at wherever `c2` currently sits.
    shape: 'CriterionEvidence | CriterionTrace',
    discriminators: ['criterionId'],
    hash: (row) => `criterion:${String(row['criterionId'])}`,
  },
  {
    shape: 'ValidationReport',
    discriminators: ['validatorId'],
    hash: (row) => `validator:${String(row['validatorId'])}`,
  },
  {
    shape: 'DimensionTrace',
    discriminators: ['dimension'],
    hash: (row) => `dimension:${String(row['dimension'])}`,
  },
  {
    shape: 'DecisionStep',
    discriminators: ['order', 'factor'],
    hash: (row) => `step:${String(row['order'])}:${String(row['factor'])}`,
  },
  {
    shape: 'ControllerSummary step',
    discriminators: ['factor'],
    hash: (row) => `factor:${String(row['factor'])}`,
  },
  {
    shape: 'Remediation | RemediationNote',
    discriminators: ['subject', 'action'],
    hash: (row) => `remediation:${subjectLabel(row['subject'] as Remediation['subject'])}`,
  },
  {
    shape: 'Lesson',
    discriminators: ['kind', 'subject', 'iterations'],
    hash: (row) => `lesson:${String(row['kind'])}|${String(row['subject'])}`,
  },
  {
    shape: 'Diagnostic',
    discriminators: ['stage', 'reason'],
    hash: (row) =>
      `diagnostic:${String(row['stage'])}#${row['sample'] == null ? '-' : String(row['sample'])}#${String(row['reason'])}`,
  },
  {
    // An orchestration's log holds every child's exchanges in one list, and
    // `(scope, ordinal)` repeats across children — so the run is part of the
    // identity, and this probe must precede the bare one.
    shape: 'ExchangeEntry',
    discriminators: ['runId', 'scope', 'ordinal'],
    hash: (row) =>
      `exchange:${String(row['runId'])}#${String(row['scope'])}#${String(row['ordinal'])}`,
  },
  {
    shape: 'LlmExchangeSummaryDto',
    discriminators: ['scope', 'ordinal'],
    hash: (row) => `exchange:${String(row['scope'])}#${String(row['ordinal'])}`,
  },
  {
    // A critic's own list: two entries really can share a type and a location
    // set and still be different defects, so position is part of the identity.
    shape: 'RawFinding',
    discriminators: ['type', 'severity', 'locationRefs'],
    positional: true,
    hash: (row) => `raw:${String(row['type'])}|${refs(row['locationRefs'])}`,
  },
  {
    // A validator's own list: nothing stops two identical problems.
    shape: 'ValidationProblem',
    discriminators: ['severity', 'message'],
    positional: true,
    hash: (row) => `problem:${String(row['severity'])}|${String(row['message'])}`,
  },
  {
    shape: 'SuccessCriterion',
    discriminators: ['id', 'statement'],
    hash: (row) => `id:${String(row['id'])}`,
  },
  {
    shape: 'ArtifactLocation',
    discriminators: ['id', 'label'],
    hash: (row) => `id:${String(row['id'])}`,
  },
];

/** The first probe that recognises the row, or nothing. */
export const probeFor = (row: Row): HashProbe | undefined =>
  HASH_PROBES.find((probe) => present(row, probe.discriminators));

/**
 * An element's identity, or `undefined` for a shape this client does not know.
 *
 * A positional shape needs the index to be identified at all: without one there
 * is nothing to tell two otherwise-identical elements apart, and answering
 * anyway would be the collision this exists to prevent.
 */
export function identityOf(item: unknown, index?: number): string | undefined {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const row = item as Row;
  const probe = probeFor(row);
  if (probe === undefined) return undefined;
  if (probe.positional !== true) return probe.hash(row);
  return index === undefined ? undefined : `${probe.hash(row)}#${index}`;
}

/**
 * What the differ matches array elements by: the identity where there is one,
 * and the element's own position where there is not.
 */
export const objectHash = (item: object, index?: number): string =>
  identityOf(item, index) ?? `@${index ?? 0}`;
