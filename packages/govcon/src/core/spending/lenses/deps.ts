import type { SourceOperation, SpendingScope } from '@sysdesign/contracts';

import type {
  Attempted,
  BudgetExhausted,
  Fetched,
  RequestGate,
  SourceFailure,
  SpendSpec,
} from '../../budget';
import type { SpendingSources } from '../../ports';
import type { LensAnswer, LensSpec, Missing } from '../lens';

/** What every lens is built over: the ports, the gate, the clock, the walk deadline, and the other lenses. */
export interface LensDeps {
  sources: SpendingSources;
  gate: RequestGate;
  now: () => Date;
  /** Wall-clock budget for a walk — the pull deadline, by policy. */
  deadlineMs: number;
  /** Another lens's answer through the same snapshot cache — how lenses compose. */
  read<Q extends object, B>(spec: LensSpec<Q, B>, query: Q): Promise<LensAnswer<B>>;
}

/** HTTP attempts a lens's load has cost so far — what its provenance reports. */
export interface Tally {
  requests: number;
}

export type Spent<T> = { kind: 'ok'; value: T } | BudgetExhausted | SourceFailure;

/**
 * `gate.spend` for a lens: never cacheable (the snapshot is the cache, so a
 * fresh ledger row must not short-circuit a refresh), every attempt the
 * adapter made counted into the tally.
 */
export async function spend<K extends SourceOperation, T>(
  deps: LensDeps,
  tally: Tally,
  spec: Omit<SpendSpec<K>, 'cacheable'>,
  run: () => Promise<Attempted<Fetched<T>>>,
): Promise<Spent<T>> {
  const gated = await deps.gate.spend({ ...spec, cacheable: false }, async () => {
    const answer = await run();
    tally.requests += answer.attempts.length;
    return answer;
  });
  if (gated.kind === 'cached') throw new Error('a lens never spends a cacheable call');
  return gated;
}

export const missing = (what: string, id: string): Missing => ({ kind: 'missing', what, id });

/** The scope alone, out of a lens query that carries more. */
export const scopeOf = ({ naics, psc, agency, awardFamily }: SpendingScope): SpendingScope => ({
  naics,
  psc,
  agency,
  awardFamily,
});

/** The provider facts of several ports, each once. */
export const disclosuresOf = (
  ...ports: readonly { disclosures: readonly string[] }[]
): string[] => [...new Set(ports.flatMap((port) => port.disclosures))];
