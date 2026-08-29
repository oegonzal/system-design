import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  CanvasGraph,
  GetPromptResponse,
  GetRevisionResponse,
  GetSessionResponse,
  ListRevisionsResponse,
  ListSessionsResponse,
} from '@sysdesign/contracts';
import { EvalJob } from '@sysdesign/db';

import { call, createHarness, resetDesignData, type Harness } from '../../test/harness';

const TICKETING_ID = 'e1000000-0000-4000-8000-000000000001';
const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

const validGraph = (): CanvasGraph => ({
  nodes: [
    { id: 'client', kind: 'client', label: 'Web client' },
    { id: 'api', kind: 'service', label: 'API', config: { replicas: 3 } },
    { id: 'db', kind: 'database', label: 'Primary DB', position: { x: 100, y: 200 } },
  ],
  edges: [
    { id: 'e-client-api', source: 'client', target: 'api', kind: 'sync' },
    { id: 'e-api-db', source: 'api', target: 'db' },
  ],
});

describe('sessions', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await resetDesignData(h.em);
  });

  const makePrompt = async () => {
    const { body } = await call<GetPromptResponse>(`${h.url}/prompts/generate`, {
      method: 'POST',
      body: JSON.stringify({ experienceId: TICKETING_ID }),
    });
    return body.data;
  };

  const createSession = async (promptId: string) =>
    call<GetSessionResponse>(`${h.url}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ promptId }),
    });

  const submitRevision = async (sessionId: string, graph: unknown, notes?: string) =>
    call<GetRevisionResponse>(`${h.url}/sessions/${sessionId}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ graph, ...(notes === undefined ? {} : { notes }) }),
    });

  describe('POST /api/sessions', () => {
    it('creates an in-progress session with empty revision stats', async () => {
      const prompt = await makePrompt();
      const { status, body } = await createSession(prompt.id);

      expect(status).toBe(201);
      expect(body.data.promptId).toBe(prompt.id);
      expect(body.data.status).toBe('in-progress');
      expect(body.data.revisionCount).toBe(0);
      expect(body.data.latestRevisionNumber).toBeNull();
      expect(body.data.latestGrade).toBeNull();
    });

    it('rejects an archived prompt with 422', async () => {
      const prompt = await makePrompt();
      await call(`${h.url}/prompts/${prompt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });

      const { status, body } = await call<ApiErrorResponse>(`${h.url}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ promptId: prompt.id }),
      });

      expect(status).toBe(422);
      expect(JSON.stringify(body.message)).toContain('archived');
    });

    it('rejects an unknown prompt with 422', async () => {
      expect((await createSession(UNKNOWN_UUID)).status).toBe(422);
    });
  });

  describe('POST /api/sessions/:id/revisions', () => {
    it('creates a revision with an embedded queued evaluation and a queue job', async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);

      const { status, body } = await submitRevision(session.data.id, validGraph(), 'first cut');

      expect(status).toBe(201);
      expect(body.data.sessionId).toBe(session.data.id);
      expect(body.data.revisionNumber).toBe(1);
      expect(body.data.notes).toBe('first cut');
      expect(body.data.graph.nodes).toHaveLength(3);
      expect(body.data.evaluation?.status).toBe('queued');
      expect(body.data.evaluation?.findings).toEqual([]);
      expect(body.data.evaluation?.overallScore).toBeNull();

      // The queue row committed in the same transaction as the revision.
      const job = await h.em.fork().findOne(EvalJob, { revision: body.data.id });
      expect(job).not.toBeNull();
      expect(job?.status).toBe('queued');

      // Revision numbers are dense per session.
      const second = await submitRevision(session.data.id, validGraph());
      expect(second.body.data.revisionNumber).toBe(2);
    });

    it('rejects a node kind outside the palette with 400 — a shape error', async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);

      const graph = validGraph();
      graph.nodes[0] = { id: 'mf', kind: 'mainframe' as never, label: 'Mainframe' };

      expect((await submitRevision(session.data.id, graph)).status).toBe(400);
    });

    it('rejects referential problems with 422 listing every one', async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);

      // Dangling edge target.
      const dangling = validGraph();
      dangling.edges.push({ id: 'e-ghost', source: 'api', target: 'ghost' });
      const danglingRes = await call<ApiErrorResponse>(
        `${h.url}/sessions/${session.data.id}/revisions`,
        { method: 'POST', body: JSON.stringify({ graph: dangling }) },
      );
      expect(danglingRes.status).toBe(422);
      expect(JSON.stringify(danglingRes.body.message)).toContain('ghost');

      // Self-loop.
      const selfLoop = validGraph();
      selfLoop.edges.push({ id: 'e-loop', source: 'api', target: 'api' });
      expect((await submitRevision(session.data.id, selfLoop)).status).toBe(422);

      // Duplicate node ids.
      const dupNodes = validGraph();
      dupNodes.nodes.push({ id: 'api', kind: 'service', label: 'API again' });
      expect((await submitRevision(session.data.id, dupNodes)).status).toBe(422);

      // Duplicate edge ids.
      const dupEdges = validGraph();
      dupEdges.edges.push({ id: 'e-api-db', source: 'client', target: 'db' });
      expect((await submitRevision(session.data.id, dupEdges)).status).toBe(422);

      // Nothing was persisted along the way.
      const list = await call<ListRevisionsResponse>(
        `${h.url}/sessions/${session.data.id}/revisions`,
      );
      expect(list.body.meta.total).toBe(0);
    });

    it('rejects a revision against a non-in-progress session with 422', async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);
      await call(`${h.url}/sessions/${session.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });

      expect((await submitRevision(session.data.id, validGraph())).status).toBe(422);
    });

    it('404s for an unknown session', async () => {
      expect((await submitRevision(UNKNOWN_UUID, validGraph())).status).toBe(404);
    });
  });

  describe('POST /api/sessions/:id/revisions — interface contracts', () => {
    /** client → gateway → service → queue → worker with declared interfaces. */
    const interfaceGraph = (): CanvasGraph => ({
      nodes: [
        { id: 'client', kind: 'client', label: 'Web client' },
        {
          id: 'gw',
          kind: 'gateway',
          label: 'API Gateway',
          operations: [
            { name: 'PlaceOrder', kind: 'command' },
            { name: 'GetOrder', kind: 'query', idempotent: true },
          ],
        },
        {
          id: 'orders',
          kind: 'service',
          label: 'Order Service',
          responsibilities: ['Owns the order lifecycle', 'Publishes order events'],
          operations: [
            { name: 'PlaceOrder', kind: 'command', notes: 'Validates inventory first' },
            { name: 'GetOrder', kind: 'query', idempotent: true },
          ],
        },
        {
          id: 'order-queue',
          kind: 'queue',
          label: 'Order Queue',
          operations: [{ name: 'OrderPlaced', kind: 'event' }],
        },
        { id: 'fulfillment', kind: 'worker', label: 'Fulfillment Worker' },
      ],
      edges: [
        { id: 'e-in', source: 'client', target: 'gw', kind: 'sync' },
        {
          id: 'e-call',
          source: 'gw',
          target: 'orders',
          kind: 'sync',
          carries: ['PlaceOrder', 'GetOrder'],
        },
        {
          id: 'e-produce',
          source: 'orders',
          target: 'order-queue',
          kind: 'async',
          carries: ['OrderPlaced'],
        },
        {
          id: 'e-consume',
          source: 'order-queue',
          target: 'fulfillment',
          kind: 'async',
          carries: ['OrderPlaced'],
        },
      ],
    });

    const startSession = async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);
      return session.data.id;
    };

    it('round-trips an interface-rich graph through submit unchanged', async () => {
      const sessionId = await startSession();

      const { status, body } = await submitRevision(sessionId, interfaceGraph());

      expect(status).toBe(201);
      expect(body.data.graph).toEqual(interfaceGraph());
    });

    it('accepts a carry referencing an undeclared name — an eval lesson, not a save blocker', async () => {
      const sessionId = await startSession();
      const graph = interfaceGraph();
      graph.edges[1] = { ...graph.edges[1], carries: ['CancelOrder'] };

      expect((await submitRevision(sessionId, graph)).status).toBe(201);
    });

    it('rejects oversize interface shapes and config bags with 400', async () => {
      const sessionId = await startSession();
      const manyOps = (count: number) =>
        Array.from({ length: count }, (_, i) => ({ name: `op-${i}`, kind: 'query' as const }));

      const tooManyOps = interfaceGraph();
      tooManyOps.nodes[2] = { ...tooManyOps.nodes[2], operations: manyOps(13) };

      const tooManyResponsibilities = interfaceGraph();
      tooManyResponsibilities.nodes[2] = {
        ...tooManyResponsibilities.nodes[2],
        responsibilities: Array.from({ length: 7 }, (_, i) => `responsibility ${i}`),
      };

      const overlongOpName = interfaceGraph();
      overlongOpName.nodes[1] = {
        ...overlongOpName.nodes[1],
        operations: [{ name: 'x'.repeat(61), kind: 'command' }],
      };

      const bloatedConfig = interfaceGraph();
      bloatedConfig.nodes[2] = {
        ...bloatedConfig.nodes[2],
        config: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`key-${i}`, i])),
      };

      const nestedConfig = interfaceGraph();
      nestedConfig.nodes[2] = {
        ...nestedConfig.nodes[2],
        config: { retry: { attempts: 3 } as never },
      };

      for (const graph of [
        tooManyOps,
        tooManyResponsibilities,
        overlongOpName,
        bloatedConfig,
        nestedConfig,
      ]) {
        expect((await submitRevision(sessionId, graph)).status).toBe(400);
      }
    });

    it('rejects duplicate operation names and duplicate carries with 422', async () => {
      const sessionId = await startSession();

      const dupOps = interfaceGraph();
      dupOps.nodes[2] = {
        ...dupOps.nodes[2],
        operations: [
          { name: 'PlaceOrder', kind: 'command' },
          { name: 'PlaceOrder', kind: 'query' },
        ],
      };
      const dupOpsRes = await call<ApiErrorResponse>(`${h.url}/sessions/${sessionId}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ graph: dupOps }),
      });
      expect(dupOpsRes.status).toBe(422);
      expect(JSON.stringify(dupOpsRes.body.message)).toContain('duplicate operation name');

      const dupCarries = interfaceGraph();
      dupCarries.edges[1] = { ...dupCarries.edges[1], carries: ['GetOrder', 'GetOrder'] };
      const dupCarriesRes = await call<ApiErrorResponse>(
        `${h.url}/sessions/${sessionId}/revisions`,
        { method: 'POST', body: JSON.stringify({ graph: dupCarries }) },
      );
      expect(dupCarriesRes.status).toBe(422);
      expect(JSON.stringify(dupCarriesRes.body.message)).toContain('duplicate carries entry');
    });

    it('rejects a graph over the whole-graph operation budget with 422', async () => {
      const sessionId = await startSession();
      // 33 × 12 + 5 = 401 declared operations — one past the budget of 400.
      const graph: CanvasGraph = {
        nodes: Array.from({ length: 34 }, (_, i) => ({
          id: `svc-${i}`,
          kind: 'service' as const,
          label: `Service ${i}`,
          operations: Array.from({ length: i === 33 ? 5 : 12 }, (_, j) => ({
            name: `op-${j}`,
            kind: 'query' as const,
          })),
        })),
        edges: [],
      };

      const { status, body } = await call<ApiErrorResponse>(
        `${h.url}/sessions/${sessionId}/revisions`,
        { method: 'POST', body: JSON.stringify({ graph }) },
      );
      expect(status).toBe(422);
      expect(JSON.stringify(body.message)).toContain('401 operations');
    });
  });

  describe('GET /api/sessions/:id/revisions', () => {
    it('lists graph-free summaries, newest revision first', async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);
      await submitRevision(session.data.id, validGraph(), 'v1');
      await submitRevision(session.data.id, validGraph(), 'v2');

      const { status, body } = await call<ListRevisionsResponse>(
        `${h.url}/sessions/${session.data.id}/revisions`,
      );

      expect(status).toBe(200);
      expect(body.meta.total).toBe(2);
      expect(body.data.map((r) => r.revisionNumber)).toEqual([2, 1]);
      expect(body.data[0]).not.toHaveProperty('graph');
      expect(body.data[0]).toMatchObject({
        notes: 'v2',
        evaluationStatus: 'queued',
        overallScore: null,
        grade: null,
      });
    });
  });

  describe('GET /api/sessions', () => {
    it('summarises revision count and latest revision, latestGrade null while queued', async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);
      await submitRevision(session.data.id, validGraph());
      await submitRevision(session.data.id, validGraph());

      const { body } = await call<ListSessionsResponse>(`${h.url}/sessions`);

      expect(body.meta.total).toBe(1);
      expect(body.data[0]).toMatchObject({
        id: session.data.id,
        revisionCount: 2,
        latestRevisionNumber: 2,
        latestGrade: null,
      });
    });

    it('filters by promptId', async () => {
      const promptA = await makePrompt();
      const promptB = await makePrompt();
      await createSession(promptA.id);
      await createSession(promptB.id);

      const { body } = await call<ListSessionsResponse>(`${h.url}/sessions?promptId=${promptA.id}`);

      expect(body.meta.total).toBe(1);
      expect(body.data[0]?.promptId).toBe(promptA.id);
    });
  });

  describe('PATCH /api/sessions/:id', () => {
    it('updates the session status', async () => {
      const prompt = await makePrompt();
      const { body: session } = await createSession(prompt.id);

      const { status, body } = await call<GetSessionResponse>(
        `${h.url}/sessions/${session.data.id}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'abandoned' }) },
      );

      expect(status).toBe(200);
      expect(body.data.status).toBe('abandoned');
    });

    it('404s for an unknown session', async () => {
      const { status } = await call(`${h.url}/sessions/${UNKNOWN_UUID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      expect(status).toBe(404);
    });
  });
});
