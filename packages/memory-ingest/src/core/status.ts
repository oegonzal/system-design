import type { IngestLedger, IngestSink, ManifestEntry } from './ports';
import { entryOf, statusOf } from './record';

/**
 * The manifest read back through the loop. An entry that names an
 * orchestration is re-read; one the loop has settled is rewritten from the
 * record (status, steps, digest run), one still running or one the loop no
 * longer has is left as it was and counted.
 */
export interface StatusRefresh {
  entries: readonly ManifestEntry[];
  refreshed: number;
  running: number;
  missing: number;
}

export async function refreshStatus(deps: {
  sink: Pick<IngestSink, 'status'>;
  ledger: IngestLedger;
}): Promise<StatusRefresh> {
  const entries: ManifestEntry[] = [];
  const counts = { refreshed: 0, running: 0, missing: 0 };
  for (const entry of await deps.ledger.load()) {
    const orchestration =
      entry.orchestrationRunId === null ? null : await deps.sink.status(entry.orchestrationRunId);
    if (entry.orchestrationRunId !== null && orchestration === null) counts.missing += 1;
    if (orchestration === null || orchestration.status === 'running') {
      if (orchestration !== null) counts.running += 1;
      entries.push(entry);
      continue;
    }
    counts.refreshed += 1;
    entries.push(
      entryOf({
        identity: entry,
        orchestrationRunId: entry.orchestrationRunId,
        orchestration,
        status: statusOf(orchestration),
        error: orchestration.error?.message ?? null,
        ingestedAt: entry.ingestedAt,
        loopUrl: entry.loopUrl,
      }),
    );
  }
  await deps.ledger.save(entries);
  return { entries, ...counts };
}
