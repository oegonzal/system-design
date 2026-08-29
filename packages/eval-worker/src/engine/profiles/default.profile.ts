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
import { DEPTH_PASS_ID } from '../passes/depth/depth.pass';
import { EXPECTATIONS_PASS_ID } from '../passes/expectations/expectations.pass';
import { RULES_PASS_ID } from '../passes/rules/rules.pass';
import { SCENARIOS_PASS_ID } from '../passes/scenarios/scenarios.pass';

export const DEFAULT_PROFILE: EvalProfile = {
  id: 'default',
  version: '2.0.0',
  passes: [
    {
      pass: RULES_PASS_ID,
      enabled: true,
      options: {
        // Lessons that harden with the tier: forgivable at standard, real
        // reliability/performance debts once the prompt plays at advanced.
        severityOverrides: {
          'messaging.queue-no-dlq': { advanced: 'high' },
          'reliability.lb-single-target': { advanced: 'high' },
          'performance.no-cdn-static': { advanced: 'high' },
          'scalability.shared-db-many-services': { advanced: 'high' },
        },
      },
    },
    { pass: EXPECTATIONS_PASS_ID, enabled: true },
    { pass: CRITIC_PASS_ID, enabled: true },
    { pass: DEPTH_PASS_ID, enabled: true },
    { pass: SCENARIOS_PASS_ID, enabled: true },
  ],
  scoring: {
    model: 'coverage',
    violationPenalties: { critical: 35, high: 22, medium: 10, low: 4, info: 0 },
    violationDecay: 0.7,
    // How much each dimension contributes to the overall score; sums to 1
    // (validateProfile enforces it).
    dimensionWeights: {
      reliability: 0.2,
      scalability: 0.25,
      performance: 0.15,
      data: 0.15,
      messaging: 0.1,
      security: 0.1,
      hygiene: 0.05,
    },
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
      { ruleId: 'security.no-gateway', whenExpectationUnmet: 'exp.wfa.edge-front-door' },
      { ruleId: 'security.no-rate-limit', whenExpectationUnmet: 'exp.fst.rate-limit-edge' },
      { ruleId: 'messaging.queue-no-dlq', whenExpectationUnmet: 'exp.fst.dlq-on-queues' },
      { ruleId: 'messaging.queue-no-dlq', whenExpectationUnmet: 'exp.dag.step-dlq' },
      { ruleId: 'messaging.queue-no-dlq', whenExpectationUnmet: 'exp.wfa.retry-dlq' },
      {
        ruleId: 'messaging.queue-no-dlq',
        whenExpectationUnmet: 'exp.msp.transcode-backlog-buffer',
      },
      {
        ruleId: 'scalability.capacity-replicas-insufficient',
        whenExpectationUnmet: 'exp.fst.stateless-scale-out',
      },
      {
        ruleId: 'scalability.hot-partition-risk',
        whenExpectationUnmet: 'exp.fst.hot-partition-mitigation',
      },
      {
        ruleId: 'data.no-idempotent-consumers',
        whenExpectationUnmet: 'exp.fst.idempotent-checkout',
      },
      {
        ruleId: 'data.no-idempotent-consumers',
        whenExpectationUnmet: 'exp.wfa.exactly-once-actions',
      },
      { ruleId: 'data.no-idempotent-consumers', whenExpectationUnmet: 'exp.dag.idempotent-steps' },
      {
        ruleId: 'data.no-idempotent-consumers',
        whenExpectationUnmet: 'exp.rta.exactly-once-counts',
      },
      { ruleId: 'data.multi-writer-inventory', whenExpectationUnmet: 'exp.fst.oversell-guard' },
      { ruleId: 'data.stream-no-retention', whenExpectationUnmet: 'exp.rta.ingest-buffer-durable' },
      // The media bank's CDN expectation owns the origin-offload lesson; the
      // generic rule yields so the missing CDN is graded once.
      {
        ruleId: 'performance.origin-serves-media',
        whenExpectationUnmet: 'exp.msp.cdn-delivery',
      },
      // Observability is taught once: each archetype bank's "observed"
      // expectation owns the lesson, and the generic rule yields to it.
      {
        ruleId: 'reliability.nothing-monitored',
        whenExpectationUnmet: 'exp.fst.order-pipeline-observed',
      },
      {
        ruleId: 'reliability.nothing-monitored',
        whenExpectationUnmet: 'exp.msp.pipeline-observed',
      },
      {
        ruleId: 'reliability.nothing-monitored',
        whenExpectationUnmet: 'exp.wfa.tenant-observability',
      },
      {
        ruleId: 'reliability.nothing-monitored',
        whenExpectationUnmet: 'exp.rta.pipeline-observed',
      },
      { ruleId: 'reliability.nothing-monitored', whenExpectationUnmet: 'exp.dag.runs-observed' },
      { ruleId: 'scalability.no-autoscaling', whenExpectationUnmet: 'exp.fst.cost-scale-down' },
      { ruleId: 'scalability.no-autoscaling', whenExpectationUnmet: 'exp.dag.scale-to-zero' },
      // When queued dispatch is unmet, the missing queue is already the
      // lesson — the sync-dispatch rule would grade the same edge twice.
      { ruleId: 'dag.sync-dispatch', whenExpectationUnmet: 'exp.dag.dispatch-queue' },
      {
        ruleId: 'reliability.scheduler-single-point',
        whenExpectationUnmet: 'exp.dag.scheduler-ha',
      },
    ],
  },
};
