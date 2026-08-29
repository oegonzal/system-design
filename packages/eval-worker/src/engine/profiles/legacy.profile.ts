/**
 * The original rubric, as a declarative profile: subtractive scoring with the
 * 1.0.0 weights and bands. Encoding it proves the pass architecture changes
 * nothing by itself — every pre-existing spec passes byte-identical under
 * this profile — and it retires when the coverage profile ships.
 */
import { DIMENSION_WEIGHTS, SEVERITY_WEIGHTS } from '../scoring';
import type { EvalProfile } from '../core/profile';
import { CRITIC_PASS_ID } from '../passes/critic/critic.pass';
import { RULES_PASS_ID } from '../passes/rules/rules.pass';

export const LEGACY_PROFILE: EvalProfile = {
  id: 'legacy',
  version: '1.0.0',
  passes: [
    { pass: RULES_PASS_ID, enabled: true },
    { pass: CRITIC_PASS_ID, enabled: true },
  ],
  scoring: {
    model: 'subtractive',
    severityPenalties: SEVERITY_WEIGHTS,
    dimensionWeights: DIMENSION_WEIGHTS,
    gradeBands: { A: 90, B: 75, C: 60, D: 45 },
  },
};
