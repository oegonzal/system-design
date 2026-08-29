/**
 * The shipped rubric, v2: coverage-based scoring. Dimensions are earned by
 * meeting the prompt's expectations, violations subtract with geometric decay,
 * critical findings cap the letter grade, and suppression pairs keep one
 * lesson to one finding. Calibration (engine/calibration.spec.ts) pins what
 * these numbers mean: empty canvas 0/F, naive three-box 20/F, the solid
 * fixture 86.5/B, a genuinely excellent design 100/A.
 */
import type { EvalProfile } from '../core/profile';
import { CRITIC_PASS_ID } from '../passes/critic/critic.pass';
import { EXPECTATIONS_PASS_ID } from '../passes/expectations/expectations.pass';
import { RULES_PASS_ID } from '../passes/rules/rules.pass';
import { DIMENSION_WEIGHTS } from '../scoring';

export const DEFAULT_PROFILE: EvalProfile = {
  id: 'default',
  version: '2.0.0',
  passes: [
    { pass: RULES_PASS_ID, enabled: true },
    { pass: EXPECTATIONS_PASS_ID, enabled: true },
    { pass: CRITIC_PASS_ID, enabled: true },
  ],
  scoring: {
    model: 'coverage',
    violationPenalties: { critical: 35, high: 22, medium: 10, low: 4, info: 0 },
    violationDecay: 0.7,
    dimensionWeights: DIMENSION_WEIGHTS,
    gradeBands: { A: 92, B: 82, C: 68, D: 50 },
    gradeCaps: [
      { severity: 'critical', atLeast: 1, maxGrade: 'C' },
      { severity: 'critical', atLeast: 2, maxGrade: 'D' },
    ],
    suppressions: [
      { ruleId: 'reliability.single-db-no-replica', whenExpectationUnmet: 'exp.fst.db-failover' },
      {
        ruleId: 'messaging.no-queue-for-spike',
        whenExpectationUnmet: 'exp.fst.write-spike-buffer',
      },
      { ruleId: 'scalability.no-cache-read-heavy', whenExpectationUnmet: 'exp.fst.read-cache' },
      { ruleId: 'security.no-gateway', whenExpectationUnmet: 'exp.fst.edge-front-door' },
      { ruleId: 'security.no-rate-limit', whenExpectationUnmet: 'exp.fst.rate-limit-edge' },
      { ruleId: 'messaging.queue-no-dlq', whenExpectationUnmet: 'exp.fst.dlq-on-queues' },
    ],
  },
};
