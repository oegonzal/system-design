import type { IngestLedger, IngestSink, ManifestEntry } from './ports';
import { entryOf, sameStore, statusOf } from './record';

/**
 * The manifest read back through the configured store. An entry that names a
 * run through this store is re-read; one the service has settled is rewritten
 * from the record (status, steps, digest run, records) with its retraction
 * mark kept — the loop still reports an orchestration whose points were since
 * retracted as having stored them — and one still running or one the service
 * no longer has is left as it was and counted. A posting made through another
 * store — the other sink, another space, another tenant's scope — is that
 * store's, left as it was and counted apart.
 */
export interface StatusRefresh {
  entries: readonly ManifestEntry[];
  refreshed: number;
  running: number;
  missing: number;
  /** Postings made through another store than the configured one, left as they were. */
  elsewhere: number;
}

export async function refreshStatus(deps: {
  sink: Pick<IngestSink, 'kind' | 'spaceId' | 'scope' | 'status'>;
  ledger: IngestLedger;
}): Promise<StatusRefresh> {
  const entries: ManifestEntry[] = [];
  const counts = { refreshed: 0, running: 0, missing: 0, elsewhere: 0 };
  for (const entry of await deps.ledger.load()) {
    if (!sameStore(entry, deps.sink)) {
      counts.elsewhere += 1;
      entries.push(entry);
      continue;
    }
    const outcome = entry.orchestrationRunId === null ? null : await deps.sink.status(entry);
    if (entry.orchestrationRunId !== null && outcome === null) counts.missing += 1;
    if (outcome === null || outcome.status === 'running') {
      if (outcome !== null) counts.running += 1;
      entries.push(entry);
      continue;
    }
    counts.refreshed += 1;
    entries.push(
      entryOf({
        identity: entry,
        origin: entry,
        orchestrationRunId: entry.orchestrationRunId,
        outcome,
        status: statusOf(outcome),
        error: outcome.error,
        ingestedAt: entry.ingestedAt,
        retractedAt: entry.retractedAt,
        retractedPoints: entry.retractedPoints,
      }),
    );
  }
  await deps.ledger.save(entries);
  return { entries, ...counts };
}
