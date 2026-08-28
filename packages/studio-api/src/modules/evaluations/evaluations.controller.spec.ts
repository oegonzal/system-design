import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  CanvasGraph,
  GetEvaluationResponse,
  GetPromptResponse,
  GetRevisionResponse,
  GetSessionResponse,
  RetryEvaluationResponse,
} from '@sysdesign/contracts';
import { EvalJob, Evaluation } from '@sysdesign/db';

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

describe('evaluations', () => {
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

  /** Full path: prompt → session → one submitted revision. */
  const submitRevision = async () => {
    const { body: prompt } = await call<GetPromptResponse>(`${h.url}/prompts/generate`, {
      method: 'POST',
      body: JSON.stringify({ experienceId: TICKETING_ID }),
    });
    const { body: session } = await call<GetSessionResponse>(`${h.url}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ promptId: prompt.data.id }),
    });
    const { body: revision } = await call<GetRevisionResponse>(
      `${h.url}/sessions/${session.data.id}/revisions`,
      { method: 'POST', body: JSON.stringify({ graph }) },
    );
    return revision.data;
  };

  describe('GET /api/revisions/:id', () => {
    it('returns the full revision: graph plus embedded evaluation', async () => {
      const revision = await submitRevision();

      const { status, body } = await call<GetRevisionResponse>(`${h.url}/revisions/${revision.id}`);

      expect(status).toBe(200);
      expect(body.data.graph.nodes.map((n) => n.id)).toEqual(['client', 'api', 'db']);
      expect(body.data.evaluation?.status).toBe('queued');
      expect(body.data.evaluation?.findings).toEqual([]);
    });

    it('404s for an unknown revision', async () => {
      expect((await call(`${h.url}/revisions/${UNKNOWN_UUID}`)).status).toBe(404);
    });
  });

  describe('GET /api/revisions/:id/evaluation', () => {
    it('returns the queued evaluation for a fresh revision', async () => {
      const revision = await submitRevision();

      const { status, body } = await call<GetEvaluationResponse>(
        `${h.url}/revisions/${revision.id}/evaluation`,
      );

      expect(status).toBe(200);
      expect(body.data.revisionId).toBe(revision.id);
      expect(body.data.status).toBe('queued');
      expect(body.data.overallScore).toBeNull();
      expect(body.data.grade).toBeNull();
      expect(body.data.error).toBeNull();
    });

    it('404s for an unknown revision', async () => {
      expect((await call(`${h.url}/revisions/${UNKNOWN_UUID}/evaluation`)).status).toBe(404);
    });
  });

  describe('POST /api/revisions/:id/evaluation/retry', () => {
    it('409s while the evaluation is still queued', async () => {
      const revision = await submitRevision();

      const { status, body } = await call<ApiErrorResponse>(
        `${h.url}/revisions/${revision.id}/evaluation/retry`,
        { method: 'POST' },
      );

      expect(status).toBe(409);
      expect(JSON.stringify(body.message)).toContain('queued');
    });

    it('202s for a failed evaluation and resets it plus its queue job', async () => {
      const revision = await submitRevision();

      // Simulate the worker giving up: evaluation failed, job exhausted.
      const em = h.em.fork();
      const evaluation = await em.findOneOrFail(Evaluation, { revision: revision.id });
      evaluation.status = 'failed';
      evaluation.error = 'engine crashed';
      const job = await em.findOneOrFail(EvalJob, { revision: revision.id });
      job.status = 'failed';
      job.attempts = 3;
      job.lockedAt = new Date();
      job.lockedBy = 'worker-1';
      await em.flush();

      const { status, body } = await call<RetryEvaluationResponse>(
        `${h.url}/revisions/${revision.id}/evaluation/retry`,
        { method: 'POST' },
      );

      expect(status).toBe(202);
      expect(body.data.status).toBe('queued');
      expect(body.data.error).toBeNull();

      // The job row was reset in the same transaction, ready to be claimed.
      const resetJob = await h.em.fork().findOneOrFail(EvalJob, { revision: revision.id });
      expect(resetJob.status).toBe('queued');
      expect(resetJob.attempts).toBe(0);
      expect(resetJob.lockedAt).toBeNull();
      expect(resetJob.lockedBy).toBeNull();
    });
  });
});
