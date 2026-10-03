/**
 * The shape of an exact check a pipeline brings: a rule over a well-formed
 * artifact and the index its goal carries. The validator runs on every
 * artifact the engine hands over, well-formed or not, so it starts from the
 * output schema — read as the model seam reads a reply, so a field past its
 * size is still well-formed — it reads the index, never prose; and it blocks,
 * because an artifact that cites what was never listed cannot be trusted by
 * any lens.
 */
import {
  modelSchema,
  parseLenient,
  type BoundPath,
  type DeclaredBound,
  type LenientParse,
  type Severity,
  type ValidationProblem,
} from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import type { Validator } from '../ports';

/** Each output schema's declared bounds, indexed once: a schema is built at boot and read on every iteration. */
const indexed = new WeakMap<ZodType, Readonly<Record<BoundPath, DeclaredBound>>>();

const boundsOf = (schema: ZodType): Readonly<Record<BoundPath, DeclaredBound>> => {
  const known = indexed.get(schema);
  if (known) return known;
  const { bounds } = modelSchema(schema);
  indexed.set(schema, bounds);
  return bounds;
};

/**
 * An artifact read against its output schema the way the model seam reads a
 * reply: a field past its target is kept and recorded as an overrun, and only
 * a structural fault refuses it. A size limit never makes an artifact
 * malformed — to a validator any more than to the seam.
 */
export const readArtifact = <T>(schema: ZodType<T>, artifact: unknown): LenientParse<T> =>
  parseLenient(schema, artifact, boundsOf(schema));

/** The check that every reference an artifact makes is one the goal listed, once. */
export const REFERENCES_VALIDATOR_ID = 'references';
/** The check that the artifact stays within the limits the goal stated. */
export const LIMITS_VALIDATOR_ID = 'limits';

export const problem = (
  severity: Severity,
  message: string,
  locationRefs: string[] = [],
): ValidationProblem => ({ severity, locationRefs, message });

/** A rule reads a parsed artifact against the index; what it finds are the problems. */
export type IndexedRule<A, I> = (artifact: A, index: I) => ValidationProblem[];

/**
 * A blocking validator over an artifact and its goal's index. A malformed
 * artifact is the schema validator's to report, so it passes here with no
 * problems; a goal without an index yields `whenNoIndex`.
 */
export function indexedValidator<A, I>(
  id: string,
  readIndex: (goal: string) => I | null,
  rule: IndexedRule<A, I>,
  whenNoIndex: ValidationProblem[],
): Validator<A> {
  return {
    id,
    gate: 'block',
    validate: (artifact, contract) => {
      const parsed = readArtifact(contract.output.schema, artifact);
      if (!parsed.ok) return { validatorId: id, gate: 'block', problems: [] };
      const index = readIndex(contract.goal);
      const problems = index === null ? whenNoIndex : rule(parsed.value, index);
      return { validatorId: id, gate: 'block', problems };
    },
  };
}
