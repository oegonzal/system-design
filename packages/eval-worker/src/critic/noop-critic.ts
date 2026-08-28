import { EvalCritic, type CritiqueResult } from './eval-critic';

const EMPTY: CritiqueResult = { findings: [], summary: null, model: null };

/** Runs when no key is configured or EVAL_DETERMINISTIC=1 — engine output stands alone. */
export class NoopCritic extends EvalCritic {
  review(): Promise<CritiqueResult> {
    return Promise.resolve(EMPTY);
  }
}
