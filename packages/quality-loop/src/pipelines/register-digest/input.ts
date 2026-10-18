/**
 * The input codec of the register-digest pipeline. The goal is rendered by the
 * host of the memory space the text is digested for, with the contracts codec
 * (`renderRegisterDigestGoal`): the text's parts as quoted sections the model
 * cites by alias, the registers a memory may be filed under, the caller's
 * rules, the limits, and the index the validators read back here through the
 * engine's own fence reader.
 */
import {
  bound,
  readRegisterDigestIndex,
  REGISTER_DIGEST_ID,
  type RegisterDigestIndex,
} from '@sysdesign/contracts';

export { readRegisterDigestIndex as readIndex, REGISTER_DIGEST_ID };
export type { RegisterDigestIndex };

/**
 * One criterion per thing the text states that a listed register keeps, one
 * per rule the caller lists, and the three every rubric is headed by: the cap
 * document-digest declares for texts of the same size, which its deriver
 * measurably reaches (p99 24 over 240 runs), so the fixed three leave 21.
 */
export const MAX_CRITERIA = 24;

/**
 * The statement bound the deriver writes within. A capture criterion carries
 * the section's own names, values and times so the panel can check a memory
 * against it without re-reading the text — the statement document-digest
 * sized the same bound for (p99 372, longest 644 over 240 runs) — and past the
 * ceiling a statement is kept and recorded rather than discarding the rubric.
 */
export const STATEMENT_BOUND = bound(600);
