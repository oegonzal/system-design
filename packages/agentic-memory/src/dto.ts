import type { MemoryRecordDto } from '@sysdesign/contracts';

import type { MemoryRecord } from './ports';

/** A record as the wire carries it. */
export const recordDto = (record: MemoryRecord): MemoryRecordDto => ({
  id: record.id,
  register: record.register,
  kind: record.kind,
  scope: { ...record.scope },
  identity: record.identity,
  keys: [...record.keys],
  body: { ...record.body },
  metadata: { ...record.metadata },
  text: record.text,
  status: record.status,
  version: record.version,
  supersedesId: record.supersedesId,
  lineageId: record.lineageId,
  validFrom: record.validFrom.toISOString(),
  validTo: record.validTo?.toISOString() ?? null,
  recordedAt: record.recordedAt.toISOString(),
  expiresAt: record.expiresAt?.toISOString() ?? null,
  closedAt: record.closedAt?.toISOString() ?? null,
  closeReason: record.closeReason,
  support: record.support,
  provenance: {
    source: record.provenance.source,
    sourceRunId: record.provenance.sourceRunId,
    derivedFrom: [...record.provenance.derivedFrom],
  },
  projected: record.projectedInto !== null,
});
