import type { EntityManager } from '@mikro-orm/postgresql';
import type * as Contracts from '@sysdesign/contracts';

import { DesignRevision } from './entities/design-revision.entity';
import { Evaluation } from './entities/evaluation.entity';

/** The design being persisted — the same trio a submit carries. */
export interface RevisionInput {
  graph: Contracts.CanvasGraph;
  narrative?: Contracts.DesignNarrative | null;
  brief?: Contracts.DesignBrief | null;
}

/**
 * The one way a revision comes into being, shared by everything that persists
 * one: the API's submit path, the improvement-run start (base revision), and
 * the eval worker's accepted coach candidates. Dense numbering (max + 1), the
 * queued evaluation, and the caller's queue entry are created together — run
 * this inside a transaction, and let the unique (session, revision_number)
 * constraint arbitrate concurrent writers (retry on violation).
 *
 * `enqueue` stays a callback because the queue is the caller's seam: the API
 * goes through its swappable `EvalQueue`, the worker writes the job row
 * directly.
 */
export async function createRevisionRecords(
  em: EntityManager,
  sessionId: string,
  input: RevisionInput,
  origin: Contracts.RevisionOrigin,
  enqueue: (em: EntityManager, revision: DesignRevision) => Promise<void>,
): Promise<{ revision: DesignRevision; evaluation: Evaluation }> {
  const latest = await em.findOne(
    DesignRevision,
    { session: sessionId },
    { orderBy: { revisionNumber: 'desc' } },
  );

  const revision = em.create(DesignRevision, {
    session: sessionId,
    revisionNumber: (latest?.revisionNumber ?? 0) + 1,
    origin,
    graph: input.graph,
    narrative: input.narrative ?? null,
    brief: input.brief ?? null,
  });
  em.persist(revision);

  // Born queued; the worker moves it through running → complete/failed.
  const evaluation = em.create(Evaluation, { revision });
  em.persist(evaluation);

  await enqueue(em, revision);

  return { revision, evaluation };
}
