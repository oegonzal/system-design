import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  CanvasGraph,
  GetImprovementRunResponse,
  GetImproverAvailabilityResponse,
  GetPromptResponse,
  GetSessionResponse,
  StartImprovementRunResponse,
} from '@sysdesign/contracts';
import { DesignRevision, EvalJob, Evaluation, ImprovementRun } from '@sysdesign/db';

import { call, createHarness, resetDesignData, type Harness } from '../../test/harness';

const TICKETING_ID = 'e1000000-0000-4000-8000-000000000001';
const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

const graph: CanvasGraph = {
  nodes: [
    { id: 'client', kind: 'client', label: 'Web client' },
    { id: 'api', kind: 'service', label: 'API' },
    { id: 'db', kind: 'database', label: 'Primary DB' },
  ],
  edges: [
    { id: 'e1', source: 'client', target: 'api' },
    { id: 'e2', source: 'api', target: 'db' },
  ],
};

describe('improvement runs', () => {
  let h: Harness;

  beforeAll(async () => {
    // The API never calls the model — availability is derived per request from
    // env, so a placeholder key exercises the enabled path with zero network.
    process.env['IMPROVER_DETERMINISTIC'] = '0';
    process.env['ANTHROPIC_API_KEY'] ??= 'test-placeholder-key';
    h = await createHarness();
  });
  afterAll(async () => {
    delete process.env['IMPROVER_DETERMINISTIC'];
    await h.close();
  });
  beforeEach(async () => {
    await resetDesignData(h.em);
  });

  const createSession = async () => {
    const { body: prompt } = await call<GetPromptResponse>(`${h.url}/prompts/generate`, {
      method: 'POST',
      body: JSON.stringify({ experienceId: TICKETING_ID }),
    });
    const { body: session } = await call<GetSessionResponse>(`${h.url}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ promptId: prompt.data.id }),
    });
    return session.data;
  };

  const startRun = async (sessionId: string) =>
    call<StartImprovementRunResponse>(`${h.url}/sessions/${sessionId}/improvement-runs`, {
      method: 'POST',
      body: JSON.stringify({ graph }),
    });

  describe('GET /api/improvement-runs/availability', () => {
    it('reports the improver enabled under IMPROVER_DETERMINISTIC=0 plus a key', async () => {
      const { status, body } = await call<GetImproverAvailabilityResponse>(
        `${h.url}/improvement-runs/availability`,
      );
      expect(status).toBe(200);
      expect(body.data.enabled).toBe(true);
      expect(body.data.model).toBeTruthy();
      expect(body.data.reason).toBeNull();
    });

    it('reports deterministic-disabled truthfully, per request', async () => {
      process.env['IMPROVER_DETERMINISTIC'] = '1';
      try {
        const { body } = await call<GetImproverAvailabilityResponse>(
          `${h.url}/improvement-runs/availability`,
        );
        expect(body.data).toEqual({ enabled: false, model: null, reason: 'deterministic' });
      } finally {
        process.env['IMPROVER_DETERMINISTIC'] = '0';
      }
    });
  });

  describe('POST /api/sessions/:id/improvement-runs', () => {
    it('202s: persists the base revision (origin user, eval queued) and the queued run', async () => {
      const session = await createSession();

      const { status, body } = await startRun(session.id);

      expect(status).toBe(202);
      expect(body.data.sessionId).toBe(session.id);
      expect(body.data.status).toBe('queued');
      expect(body.data.iterations).toEqual([]);
      expect(body.data.bestRevisionId).toBeNull();
      expect(body.data.stoppedReason).toBeNull();

      const em = h.em.fork();
      const base = await em.findOneOrFail(DesignRevision, { id: body.data.baseRevisionId });
      expect(base.origin).toBe('user');
      expect(base.revisionNumber).toBe(1);
      // The base revision rides the normal eval pipeline.
      expect(await em.findOne(Evaluation, { revision: base.id })).not.toBeNull();
      expect(await em.findOne(EvalJob, { revision: base.id })).not.toBeNull();
    });

    it('409s while a run is already active, and allows a new one after cancel', async () => {
      const session = await createSession();
      const first = await startRun(session.id);
      expect(first.status).toBe(202);

      const second = await startRun(session.id);
      expect(second.status).toBe(409);
      expect(JSON.stringify((second.body as unknown as ApiErrorResponse).message)).toContain(
        'already active',
      );

      await call(`${h.url}/improvement-runs/${first.body.data.id}/cancel`, { method: 'POST' });
      expect((await startRun(session.id)).status).toBe(202);
    });

    it('409s with an honest reason when the improver is unavailable', async () => {
      process.env['IMPROVER_DETERMINISTIC'] = '1';
      try {
        const session = await createSession();
        const { status, body } = await startRun(session.id);
        expect(status).toBe(409);
        expect(JSON.stringify((body as unknown as ApiErrorResponse).message)).toContain(
          'deterministic',
        );
      } finally {
        process.env['IMPROVER_DETERMINISTIC'] = '0';
      }
    });

    it('422s on a graph that does not hold together, storing nothing', async () => {
      const session = await createSession();
      const { status } = await call(`${h.url}/sessions/${session.id}/improvement-runs`, {
        method: 'POST',
        body: JSON.stringify({
          graph: {
            nodes: [{ id: 'a', kind: 'client', label: 'A' }],
            edges: [{ id: 'e1', source: 'a', target: 'ghost' }],
          },
        }),
      });
      expect(status).toBe(422);
      const em = h.em.fork();
      expect(await em.count(ImprovementRun)).toBe(0);
      expect(await em.count(DesignRevision)).toBe(0);
    });

    it('404s for an unknown session', async () => {
      expect((await startRun(UNKNOWN_UUID)).status).toBe(404);
    });
  });

  describe('GET /api/improvement-runs/:id and cancel', () => {
    it('polls the run and cancels it exactly once', async () => {
      const session = await createSession();
      const { body: started } = await startRun(session.id);

      const { status, body } = await call<GetImprovementRunResponse>(
        `${h.url}/improvement-runs/${started.data.id}`,
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(started.data.id);
      expect(body.data.maxIterations).toBeGreaterThan(0);

      const cancel = await call<GetImprovementRunResponse>(
        `${h.url}/improvement-runs/${started.data.id}/cancel`,
        { method: 'POST' },
      );
      expect(cancel.status).toBe(202);
      expect(cancel.body.data.status).toBe('cancelled');
      expect(cancel.body.data.stoppedReason).toBe('cancelled');

      const again = await call(`${h.url}/improvement-runs/${started.data.id}/cancel`, {
        method: 'POST',
      });
      expect(again.status).toBe(409);
    });

    it('404s for an unknown run', async () => {
      expect((await call(`${h.url}/improvement-runs/${UNKNOWN_UUID}`)).status).toBe(404);
    });
  });
});
