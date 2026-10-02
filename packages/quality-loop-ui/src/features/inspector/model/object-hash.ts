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
 * artifact and an orchestrator's own step report. For those the honest fallback
 * is position. The library's own `matchByPosition` option cannot deliver it —
 * once an `objectHash` is supplied, an element whose hash comes back undefined
 * is treated as matching nothing at all, so every element of an unknown array
 * would read as removed and re-added. The fallback therefore lives *inside* the
 * hash: an unrecognised element is identified by its index, which matches
 * position to position and nothing else.
 *
 * `identityOf` keeps the honest answer — `undefined` for a shape with no domain
 * identity — because a printed path should say `[3]` rather than pretend the
 * third element has a name.
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
    shape: 'PenaltyTrace',
    discriminators: ['key', 'position'],
    hash: (row) => `penalty:${String(row['key'])}#${String(row['position'])}`,
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
    shape: 'CriterionEvidence | CriterionTrace | RawCriterionResult',
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
    shape: 'RawFinding',
    discriminators: ['type', 'severity', 'locationRefs'],
    hash: (row) => `raw:${String(row['type'])}|${refs(row['locationRefs'])}`,
  },
  {
    shape: 'ValidationProblem',
    discriminators: ['severity', 'message'],
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

/** An element's domain identity, or `undefined` for a shape this client does not know. */
export function identityOf(item: unknown): string | undefined {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const row = item as Row;
  return probeFor(row)?.hash(row);
}

/**
 * What the differ matches array elements by: the domain identity where there is
 * one, and the element's own position where there is not.
 */
export const objectHash = (item: object, index?: number): string =>
  identityOf(item) ?? `@${index ?? 0}`;
