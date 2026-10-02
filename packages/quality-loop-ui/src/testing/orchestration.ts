import type { OrchestrationRunDto, PanelReportDto } from '@sysdesign/contracts';

/**
 * One orchestration as `GET /orchestrations/:id` reports it: a calibration —
 * three samples of one pipeline, then a reconcile that says how far the verdicts
 * spread. The report is the orchestrator's own shape, which is the point: the
 * inspector has to render it without knowing it.
 */

const REPORT: PanelReportDto = {
  alignment: 'produced',
  runs: 3,
  decisions: { revise: 2, accept: 1 },
  stopReasons: { 'max-iterations': 2, accepted: 1 },
  gates: { artifactPresent: 3, validatorsPassed: 3, evidenceSufficient: 3, policyAllowed: 3 },
  iterations: { n: 3, min: 1, max: 1, mean: 1, range: 0 },
  overall: { n: 3, min: 65.2, max: 88, mean: 74.1, range: 22.8 },
  dimensions: {
    completeness: { n: 3, min: 50, max: 100, mean: 66.7, range: 50 },
    soundness: { n: 3, min: 88, max: 100, mean: 92, range: 12 },
  },
  findingTypes: { missing_requirement: 2, unsupported_claim: 3 },
  unanimous: { findingTypes: ['unsupported_claim'], findings: [] },
  contested: {
    decision: true,
    findingTypes: ['missing_requirement'],
    // An array of objects inside the orchestrator's own report: the one place a
    // real record carries a shape this client is not allowed to know.
    findings: [
      { key: 'missing_requirement|component.2', type: 'missing_requirement', seenBy: [0, 2] },
    ],
  },
};

const CHILD_IDS = [
  '2026-09-06T00-00-10-000-aaa111-quality',
  '2026-09-06T00-00-10-000-bbb222-quality',
  '2026-09-06T00-00-10-000-ccc333-quality',
];

export const ORCHESTRATION_CHILD_IDS: readonly string[] = CHILD_IDS;

export const makeOrchestration = (
  overrides: Partial<OrchestrationRunDto> = {},
): OrchestrationRunDto => ({
  orchestrationRunId: '4f1d8c0e-2b7a-4c55-9d31-7f0e6a9b1c22',
  orchestrator: 'calibration',
  pipeline: 'system-design',
  status: 'complete',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:12:04.000Z',
  request: {
    goal: 'Design an order history service.',
    outputProvided: false,
    criteriaProvided: false,
    adoptedFrom: null,
    maxIterations: 1,
    samples: 3,
  },
  context: { available: ['system-design'], unavailable: [] },
  steps: {
    panel: {
      status: 'complete',
      reason: null,
      runIds: [...CHILD_IDS],
      note: null,
      counts: { requested: 3, opened: 3, complete: 3, failed: 0 },
      report: null,
      startedAt: '2026-09-06T00:00:00.100Z',
      finishedAt: '2026-09-06T00:11:40.000Z',
    },
    reconcile: {
      status: 'complete',
      reason: null,
      runIds: [],
      note: null,
      counts: { runs: 3, contested: 1 },
      report: REPORT as unknown as Record<string, unknown>,
      startedAt: '2026-09-06T00:11:40.000Z',
      finishedAt: '2026-09-06T00:12:04.000Z',
    },
  },
  error: null,
  ...overrides,
});

/** The same orchestration mid-flight: the panel still open with two of three children. */
export const makeRunningOrchestration = (): OrchestrationRunDto => {
  const complete = makeOrchestration();
  return makeOrchestration({
    status: 'running',
    finishedAt: null,
    steps: {
      panel: {
        ...complete.steps.panel,
        status: 'running',
        runIds: CHILD_IDS.slice(0, 2),
        counts: { requested: 3, opened: 2, complete: 1, failed: 0 },
        finishedAt: null,
      },
      reconcile: {
        status: 'pending',
        reason: null,
        runIds: [],
        note: null,
        counts: {},
        report: null,
        startedAt: null,
        finishedAt: null,
      },
    },
  });
};

/**
 * A memory orchestration over a settled run: `recall` and `target` both settled
 * at open because a provided run stands in for them, then `digest` and `store`.
 *
 * The shape worth having a fixture for is `target`: skipped, carrying the source
 * run's id, and with no `startedAt` — a step that names a run it never opened.
 */
export const MEMORY_SOURCE_RUN_ID = '2026-10-02T02-39-17-636-b94aa4-quality';

export const makeMemoryOrchestration = (
  overrides: Partial<OrchestrationRunDto> = {},
): OrchestrationRunDto => ({
  orchestrationRunId: '9b2e41aa-6c0d-4f1e-8a77-51c3de90bb14',
  orchestrator: 'memory',
  pipeline: 'system-design-canvas',
  status: 'complete',
  startedAt: '2026-10-02T02:50:00.000Z',
  finishedAt: '2026-10-02T02:53:12.000Z',
  request: {
    goal: '',
    outputProvided: false,
    criteriaProvided: true,
    adoptedFrom: null,
    maxIterations: 1,
    samples: null,
  },
  context: { available: ['experience-digest'], unavailable: [] },
  steps: {
    recall: {
      status: 'skipped',
      reason: 'provided-run',
      runIds: [],
      note: null,
      counts: {},
      report: null,
      // Settled at open, so it never started.
      startedAt: null,
      finishedAt: '2026-10-02T02:50:00.000Z',
    },
    target: {
      status: 'skipped',
      reason: 'provided-run',
      // The source run stood in; this step opened nothing.
      runIds: [MEMORY_SOURCE_RUN_ID],
      note: null,
      counts: {},
      report: null,
      startedAt: null,
      finishedAt: '2026-10-02T02:50:00.000Z',
    },
    digest: {
      status: 'complete',
      reason: null,
      runIds: ['2026-10-02T02-50-01-004-7c91de-quality'],
      note: null,
      counts: { lessons: 5 },
      report: null,
      startedAt: '2026-10-02T02:50:01.000Z',
      finishedAt: '2026-10-02T02:52:40.000Z',
    },
    store: {
      status: 'complete',
      reason: null,
      runIds: [],
      note: null,
      counts: { stored: 5, skipped: 0 },
      report: null,
      startedAt: '2026-10-02T02:52:40.000Z',
      finishedAt: '2026-10-02T02:53:12.000Z',
    },
  },
  error: null,
  ...overrides,
});
