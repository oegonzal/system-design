/**
 * The shape of an exact check a pipeline brings: a rule over a well-formed
 * artifact and the index its goal carries. The validator runs on every
 * artifact the engine hands over, well-formed or not, so it starts from the
 * output schema — read as the model seam reads a reply, so a field past its
 * size is still well-formed — and it reads the index, never prose. What its
 * problems do is declared: `block`, because an artifact that cites what was
 * never listed cannot be trusted by any lens; or `cut`, for a positional
 * artifact whose units run in order, where a fault at one unit refuses it and
 * what follows, says nothing against the units before it, and leaves the whole
 * for the lenses to judge.
 */
import {
  modelSchema,
  parseLenient,
  type BoundPath,
  type DeclaredBound,
  type LenientParse,
  type Severity,
  type ValidationProblem,
  type ValidatorGate,
  type Withholding,
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

/** A gate an indexed validator may declare: its problems refuse, one way or the other. */
export type RefusingGate = Exclude<ValidatorGate, 'warn'>;

/**
 * A refusing validator over an artifact and its goal's index, with the gate
 * it declares. A malformed artifact is the schema validator's to report, so
 * it passes here with no problems; a goal without an index yields
 * `whenNoIndex`.
 */
export function indexedValidator<A, I>(
  id: string,
  readIndex: (goal: string) => I | null,
  rule: IndexedRule<A, I>,
  whenNoIndex: ValidationProblem[],
  gate: RefusingGate = 'block',
): Validator<A> {
  return {
    id,
    gate,
    validate: (artifact, contract) => {
      const parsed = readArtifact(contract.output.schema, artifact);
      if (!parsed.ok) return { validatorId: id, gate, problems: [] };
      const index = readIndex(contract.goal);
      const problems = index === null ? whenNoIndex : rule(parsed.value, index);
      return { validatorId: id, gate, problems };
    },
  };
}

/**
 * A validator — every field of it passed through — whose problems warn
 * rather than block, both on the validator and on every report it returns,
 * and which declares what its problems withhold of the item they name when
 * the pipeline says so (`Validator.withholds`; undeclared, a reader withholds
 * every item they name). Only a warning may declare it: a failing blocking
 * validator closes admission, so no reader ever sees its problems.
 */
export function asWarning<A>(validator: Validator<A>, withholds?: Withholding): Validator<A> {
  return {
    ...validator,
    gate: 'warn',
    ...(withholds === undefined ? {} : { withholds }),
    validate: (artifact, contract) => ({ ...validator.validate(artifact, contract), gate: 'warn' }),
  };
}
