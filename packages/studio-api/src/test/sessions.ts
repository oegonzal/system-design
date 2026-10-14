import type {
  CanvasGraph,
  DesignBrief,
  DesignNarrative,
  DesignSubmission,
  GetEvaluationResponse,
  GetImproveRunResponse,
  GetRevisionResponse,
  GetSessionResponse,
  SessionDraft,
  StartImproveResponse,
  SuccessCriterion,
} from '@sysdesign/contracts';
import type { FakeIteration } from '@sysdesign/studio-testing';

import { call, type Harness } from './harness';
import { authoredPrompt, promptsApi } from './prompts';

export const validGraph = (): CanvasGraph => ({
  nodes: [
    { id: 'client', kind: 'client', label: 'Web client' },
    {
      id: 'api',
      kind: 'service',
      label: 'API',
      config: [{ key: 'replicas', value: 3 }],
      operations: [{ name: 'listOrders', kind: 'query' }],
    },
    { id: 'db', kind: 'database', label: 'Primary DB', position: { x: 100, y: 200 } },
  ],
  edges: [
    { id: 'e-client-api', source: 'client', target: 'api', kind: 'sync', carries: ['listOrders'] },
    { id: 'e-api-db', source: 'api', target: 'db', kind: 'sync' },
  ],
});

export const validBrief = (): DesignBrief => ({
  version: 1,
  bindings: [
    {
      criterionId: 'c1',
      nodeIds: ['api', 'db'],
      path: ['e-client-api', 'e-api-db'],
      claim: 'the API reads the customer shard',
    },
    { criterionId: 'c3', nodeIds: ['api'], claim: 'three replicas behind the gateway' },
  ],
});

export const validNarrative = (overview = 'first cut'): DesignNarrative => ({
  version: 1,
  overview,
  componentRationales: [{ nodeId: 'db', prose: 'The primary DB is the source of truth.' }],
  criterionNarrations: [{ criterionId: 'c1', prose: 'Client → API → DB, newest first.' }],
});

export const submission = (
  graph: CanvasGraph = validGraph(),
  brief: DesignBrief | null = validBrief(),
  narrative: DesignNarrative | null = validNarrative(),
): DesignSubmission => ({ graph, brief, narrative });

/** An unsubmitted canvas: a binding still empty and a claim not yet written — shape only. */
export const draft = (): SessionDraft => ({
  graph: validGraph(),
  brief: { version: 1, bindings: [{ criterionId: 'c2', nodeIds: [], claim: '' }] },
  narrative: null,
});

/** The coach's second iteration: the author's graph plus a read replica, ids prefixed ai-. */
export const coached = (): DesignSubmission => {
  const base = submission();
  return {
    ...base,
    graph: {
      nodes: [...base.graph.nodes, { id: 'ai-replica', kind: 'replica', label: 'Read replica' }],
      edges: [
        ...base.graph.edges,
        { id: 'ai-e-replica', source: 'db', target: 'ai-replica', kind: 'async' },
      ],
    },
  };
};

/** Prose of exactly `length` characters, in words — what a coach writes when it runs long. */
export const prose = (length: number): string =>
  'the replica absorbs every repeat read of the order history '.repeat(60).slice(0, length);

/**
 * An iteration the loop's evidence gate found too thin for a verdict: no lens
 * settled a criterion, so the controller escalated over a number that is no
 * score — as on a grade during a provider outage.
 */
export const unassessedIteration = (
  criteria: readonly SuccessCriterion[],
  overrides: Partial<FakeIteration> = {},
): FakeIteration => ({
  overall: 0,
  decision: 'escalate',
  evidenceSufficient: false,
  dimensions: { coverage: 0, quality_attributes: 0, compliance: 0 },
  criteria: criteria.map((criterion) => ({
    criterionId: criterion.id,
    kind: criterion.kind,
    result: 'unassessed' as const,
    hits: 0,
    confidence: 'none' as const,
    locationRefs: [],
  })),
  reason: 'only 0% of criteria assessed',
  ...overrides,
});

/**
 * The sessions surface as the specs drive it: a session to work in, a submit,
 * a grade's read, and the coach's start and read, each read through the
 * harness at call time.
 */
export const sessionsApi = (h: Harness) => {
  const { author } = promptsApi(h);
  const makePrompt = async () => (await author(authoredPrompt())).body.data;

  const createSession = async (promptId: string) =>
    call<GetSessionResponse>(`${h.url}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ promptId }),
    });

  const startSession = async () => {
    const prompt = await makePrompt();
    const { body } = await createSession(prompt.id);
    return { prompt, sessionId: body.data.id };
  };

  const submit = (sessionId: string, body: unknown) =>
    call<GetRevisionResponse>(`${h.url}/sessions/${sessionId}/revisions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const evaluation = (revisionId: string) =>
    call<GetEvaluationResponse>(`${h.url}/revisions/${revisionId}/evaluation`);

  const startImprove = (sessionId: string, body: unknown) =>
    call<StartImproveResponse>(`${h.url}/sessions/${sessionId}/improve`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const readImprove = (sessionId: string, runId: string) =>
    call<GetImproveRunResponse>(`${h.url}/sessions/${sessionId}/improve/${runId}`);

  return { makePrompt, createSession, startSession, submit, evaluation, startImprove, readImprove };
};
