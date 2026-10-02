import type { IterationTrace, SuccessCriterion } from '@sysdesign/contracts';

/** One judged iteration; the UI renders, it does not score, so the figures need not reproduce the policy. */

export const CRITERIA: readonly SuccessCriterion[] = [
  { id: 'c1', kind: 'functional', statement: 'A signed-in shopper sees one Order History list.' },
  { id: 'c2', kind: 'scale', statement: 'The history page answers within 300 ms at p99.' },
];

export const RENDERED = [
  '[summary] One service, two feeds.',
  '',
  '## Components',
  '[component.1] Order API — serves the history list',
  '[component.2] Sync worker — pulls in-store sales over REST',
].join('\n');

export const makeIteration = (overrides: Partial<IterationTrace> = {}): IterationTrace => ({
  iteration: 1,
  mode: 'initial',
  artifact: { summary: 'One service, two feeds.' },
  locations: [
    { id: 'summary', label: 'Summary' },
    { id: 'component.1', label: 'Order API' },
    { id: 'component.2', label: 'Sync worker' },
  ],
  rendered: RENDERED,
  validation: [{ validatorId: 'schema', gate: 'block', problems: [] }],
  critics: [
    {
      report: {
        criticId: 'critic.requirements',
        sample: 1,
        findings: [
          {
            type: 'missing_requirement',
            severity: 'high',
            confidence: 'high',
            fixability: 'fixable_local',
            locationRefs: ['component.2'],
            criterionIds: ['c2'],
            rationale: 'The worker polls every five minutes; nothing bounds page latency.',
          },
          {
            type: 'unsupported_claim',
            severity: 'medium',
            confidence: 'medium',
            fixability: 'fixable_local',
            locationRefs: ['summary'],
            criterionIds: [],
            rationale: 'The summary promises sub-second freshness the design never shows.',
          },
          // A SECOND finding of the same type at the same location, and a
          // different defect. Recorded runs really do this — a critic sample on
          // 2026-09-30 reported `topology_defect|edge.4,node.3,node.5` twice —
          // and nothing in the contract prevents it, because this is a model's
          // own list. It is in the fixture so the identity walk has to cope.
          {
            type: 'unsupported_claim',
            severity: 'low',
            confidence: 'low',
            fixability: 'requires_user',
            locationRefs: ['summary'],
            criterionIds: [],
            rationale: 'The summary also claims a replica the component list never mentions.',
          },
        ],
      },
      diagnostic: null,
    },
  ],
  evaluators: [
    {
      report: {
        evaluatorId: 'evaluator.requirements',
        sample: 1,
        results: [
          {
            criterionId: 'c1',
            result: 'pass',
            confidence: 'high',
            locationRefs: ['component.1'],
            rationale: 'The Order API serves one merged list.',
          },
          {
            criterionId: 'c2',
            result: 'fail',
            confidence: 'medium',
            locationRefs: ['component.2'],
            rationale: 'No latency budget or cache is described.',
          },
        ],
        advisoryVerdict: 'revise',
      },
      diagnostic: null,
    },
  ],
  ledger: {
    artifactPresent: true,
    validation: [{ validatorId: 'schema', gate: 'block', problems: [] }],
    criteria: [
      {
        criterionId: 'c1',
        kind: 'functional',
        result: 'pass',
        hits: 1,
        confidence: 'high',
        locationRefs: ['component.1'],
      },
      {
        criterionId: 'c2',
        kind: 'scale',
        result: 'fail',
        hits: 1,
        confidence: 'medium',
        locationRefs: ['component.2'],
      },
    ],
    findings: [
      {
        key: 'missing_requirement|component.2',
        type: 'missing_requirement',
        severity: 'high',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['component.2'],
        criterionIds: ['c2'],
        hits: 1,
        lenses: ['critic.requirements'],
        rationale: 'The retention target the goal states is met by nothing in the design.',
        reconciledTo: 'c2',
      },
      {
        key: 'unsupported_claim|summary',
        type: 'unsupported_claim',
        severity: 'medium',
        confidence: 'medium',
        fixability: 'fixable_local',
        locationRefs: ['summary'],
        criterionIds: [],
        hits: 1,
        lenses: ['critic.requirements'],
        rationale: 'The summary claims a cache no component provides.',
        reconciledTo: null,
      },
    ],
    discarded: [],
    diagnostics: [],
  },
  decision: {
    finalDecision: 'revise',
    gates: {
      artifactPresent: true,
      validatorsPassed: true,
      evidenceSufficient: true,
      policyAllowed: true,
    },
    scores: { dimensions: { completeness: 50, soundness: 88 }, overall: 65.2 },
    selectedRemediations: [
      {
        subject: { criterion: 'c2' },
        action: 'revise',
        severity: 'high',
        targetRefs: ['component.2'],
      },
      {
        subject: { finding: 'unsupported_claim|summary' },
        action: 'revise',
        severity: 'medium',
        targetRefs: ['summary'],
      },
    ],
    reason: 'overall 65.2 is below acceptAt 80 and above rejectBelow 35; revise',
    trace: {
      steps: [
        { order: 1, factor: 'scores', outcome: 'computed', detail: 'overall 65.2' },
        { order: 2, factor: 'artifact', outcome: 'passed', detail: 'artifact present' },
        { order: 3, factor: 'validators', outcome: 'passed', detail: 'no blocking problems' },
        { order: 4, factor: 'evidence', outcome: 'passed', detail: '2 of 2 criteria assessed' },
        { order: 5, factor: 'policy-allowed', outcome: 'passed', detail: 'no blockers' },
        { order: 6, factor: 'accept-threshold', outcome: 'passed', detail: '65.2 < 80' },
        { order: 7, factor: 'reject-floor', outcome: 'passed', detail: '65.2 ≥ 35' },
        { order: 8, factor: 'route', outcome: 'decided', detail: 'revise: 2 remediations' },
      ],
      dimensions: [
        {
          dimension: 'completeness',
          weight: 0.6,
          criteria: [
            { criterionId: 'c1', kind: 'functional', weight: 1, result: 'pass', value: 1 },
            { criterionId: 'c2', kind: 'scale', weight: 1, result: 'fail', value: 0 },
          ],
          base: 50,
          penalties: [],
          penaltyTotal: 0,
          clampScale: 1,
          score: 50,
        },
        {
          dimension: 'soundness',
          weight: 0.4,
          criteria: [],
          base: 100,
          penalties: [
            {
              key: 'unsupported_claim|summary',
              position: 0,
              severity: 'medium',
              confidence: 'medium',
              listPoints: 12,
              decayed: 12,
              points: 12,
            },
          ],
          penaltyTotal: 12,
          clampScale: 1,
          score: 88,
        },
      ],
      weightSum: 1,
      weightedTotal: 65.2,
    },
  },
  remediations: [
    {
      subject: { criterion: 'c2' },
      action: 'revise',
      severity: 'high',
      targetRefs: ['component.2'],
      note: 'No latency budget or cache is described.',
    },
    {
      subject: { finding: 'unsupported_claim|summary' },
      action: 'revise',
      severity: 'medium',
      targetRefs: ['summary'],
      note: 'The summary promises sub-second freshness the design never shows.',
    },
  ],
  durationMs: 312_000,
  ...overrides,
});
