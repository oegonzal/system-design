/**
 * The refusals of the memory host's space routes, declared once for the host
 * that answers them and any client that reads them. The runtime's own
 * refusals (`memory.ts`) are joined by the host's: a loop record is the
 * subject of the `run.*` codes, whichever route reads one — the loop has no
 * such run, or not one this route reads (`run.not_found`); it is still going
 * (`run.in_flight`); or it holds no memory strategy that reads
 * (`run.no_strategy`). A digest is refused when no register is left for it to
 * write (`digest.no_registers`), when its goal would not fit the engine's
 * budget (`digest.too_large`), when its digest step left no report to
 * remember (`digest.no_report`), and when it has been remembered already
 * (`digest.applied`).
 *
 * Each code has one HTTP status: what an address does not find is 404; what
 * has moved on — a run still running, a record superseded, a digest applied
 * already, a name another run holds — or a write that lost its race is 409;
 * and a request the space's declarations, or a digest's own record, do not
 * serve is 422.
 */
import { MEMORY_REFUSALS } from './memory';

/** What the host refuses before the runtime is asked. */
export const SPACE_HOST_REFUSALS = [
  'run.not_found',
  'run.in_flight',
  'run.no_strategy',
  'digest.no_registers',
  'digest.too_large',
  'digest.no_report',
  'digest.applied',
] as const;
export type SpaceHostRefusal = (typeof SPACE_HOST_REFUSALS)[number];

/** Every refusal a space route can answer: the runtime's and the host's. */
export const SPACE_REFUSALS = [...MEMORY_REFUSALS, ...SPACE_HOST_REFUSALS] as const;
export type SpaceRefusal = (typeof SPACE_REFUSALS)[number];

/** Declared with `satisfies`, so a refusal added to either vocabulary does not compile until it has its status here. */
export const SPACE_REFUSAL_STATUS = {
  'space.not_found': 404,
  'space.not_compiled': 422,
  'space.name_taken': 409,
  'register.unknown': 422,
  'operation.undeclared': 422,
  'scope.invalid': 422,
  'candidate.invalid': 422,
  'metadata.undeclared': 422,
  'record.not_found': 404,
  'record.not_current': 409,
  'identity.mismatch': 422,
  conflict: 409,
  'consolidation.unavailable': 422,
  'run.not_found': 404,
  'run.in_flight': 409,
  'run.no_strategy': 422,
  'digest.no_registers': 422,
  'digest.too_large': 422,
  'digest.no_report': 422,
  'digest.applied': 409,
} as const satisfies Record<SpaceRefusal, number>;

/** The refusals declared 404. */
type SpaceNotFound = {
  [K in SpaceRefusal]: (typeof SPACE_REFUSAL_STATUS)[K] extends 404 ? K : never;
}[SpaceRefusal];

/**
 * What each not-found names as missing, by kind (the envelope's rule for every
 * 404 an API raises itself). Typed over exactly the codes declared 404, so a
 * not-found added to either vocabulary does not compile until it says what.
 */
export const SPACE_REFUSAL_MISSING = {
  'run.not_found': 'run',
  'space.not_found': 'space',
  'record.not_found': 'record',
} as const satisfies Record<SpaceNotFound, string>;

/** True for a code a space route can answer with: what a reader checks an error body's code against before trusting it. */
export const isSpaceRefusal = (code: string): code is SpaceRefusal =>
  (SPACE_REFUSALS as readonly string[]).includes(code);
