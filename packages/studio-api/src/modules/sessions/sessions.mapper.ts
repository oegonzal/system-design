import type { DesignSessionDto } from '@sysdesign/contracts';

import type { SessionWithLatest } from './sessions.service';

/**
 * Session projection. The latest revision and its evaluation ride alongside
 * the entity because the DTO summarises them (`latestRevisionNumber`,
 * `latestGrade`) while the entity graph only reaches them through queries the
 * service already ran.
 */
export const toSessionDto = ({
  session,
  latestRevision,
  latestEvaluation,
}: SessionWithLatest): DesignSessionDto => ({
  id: session.id,
  promptId: session.prompt.id,
  status: session.status,
  revisionCount: session.revisions.count(),
  latestRevisionNumber: latestRevision?.revisionNumber ?? null,
  latestGrade: latestEvaluation?.grade ?? null,
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString(),
});
