import type { DecisionPolicy, EvidenceLedger } from '@sysdesign/contracts';

import { readIndex } from './input';

/**
 * A stop condition is words on a page: a page that shows nothing shows no stop,
 * so a stop cannot be "missed" or "reached" there. The limits validator already
 * cuts a `terminate` on a page that shows nothing; this is the judge side of
 * the same principle.
 *
 * On a contentless page — the step index's `pageShowsContent` is false: the
 * initial about:blank, a page that has not loaded — a failed GATING criterion
 * was not founded, because there was nothing on the page to fail it against. It
 * is re-marked `not_applicable`, which both removes it as a blocker and
 * de-corroborates any gating finding that cited it (a finding blocks only when
 * the evaluator failed a gating criterion it names), so the navigate that would
 * leave the blank page is no longer gated. The finding stays on the ledger,
 * contradicted and priced, as the record of what the critic said.
 *
 * Measured 2026-10-08: a bare `[navigate]` off about:blank was `reject`ed —
 * the evaluator failed the limit-reached criterion c12 at the assessment and a
 * `missed_stop` cited it — and ten sessions died on the launchpad this way.
 *
 * The gating kinds are read from the policy, not named here, so this stays
 * true to whatever the pipeline declares gates.
 */
export function refoundOnContentlessPage(
  ledger: EvidenceLedger,
  goal: string,
  policy: DecisionPolicy,
): EvidenceLedger {
  if (readIndex(goal)?.pageShowsContent !== false) return ledger;
  const gating = new Set(
    Object.entries(policy.criterionKinds)
      .filter(([, mapped]) => mapped.gate)
      .map(([kind]) => kind),
  );
  let changed = false;
  const criteria = ledger.criteria.map((evidence) => {
    if (!gating.has(evidence.kind) || evidence.result !== 'fail') return evidence;
    changed = true;
    return { ...evidence, result: 'not_applicable' as const };
  });
  return changed ? { ...ledger, criteria } : ledger;
}
