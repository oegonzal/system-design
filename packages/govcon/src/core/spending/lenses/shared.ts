import type { AgencyRef } from '@sysdesign/contracts';

import { agencyNamed } from '../agency';
import type { LensRefusal } from '../lens';
import { missing, type LensDeps } from './deps';
import { directoryLens } from './directory';
import { freshnessLens } from './freshness';

export type ResolvedAgency = { kind: 'ok'; value: AgencyRef | null } | LensRefusal;

/**
 * The awarding agency a scope names, as USAspending filters by it — a name,
 * resolved through the directory snapshot. No scope: no agency. A code the
 * directory does not have is `missing`, and nothing scoped is spent on it.
 */
export async function resolveAgency(
  deps: LensDeps,
  toptierCode: string | null,
): Promise<ResolvedAgency> {
  if (toptierCode === null) return { kind: 'ok', value: null };
  const directory = await deps.read(directoryLens(deps), {});
  if (directory.kind !== 'ok') return directory;
  const entry = agencyNamed(directory.body.entries, toptierCode);
  return entry === null
    ? missing('agency', toptierCode)
    : { kind: 'ok', value: { toptierCode, name: entry.name } };
}

/** The source's "data as of", through the freshness snapshot; a source that cannot say costs the lens nothing. */
export async function asOfFrom(deps: LensDeps): Promise<string | null> {
  const answer = await deps.read(freshnessLens(deps), {});
  return answer.kind === 'ok' ? answer.body.lastUpdated : null;
}
