'use client';

import {
  MAX_PIPELINE_LIMIT,
  TARGET_STAGES,
  windowOf,
  type AmountRange,
  type PrimeRow,
  type ScopeQuery,
  type WindowPreset,
} from '@sysdesign/contracts';
import { Alert, BusyRegion, LiveRegion, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { FIRST_LOOK_NOTE, LENS_LOADING } from './costs';
import { PrimeRecord, PrimesReadLine, PrimesSummary, PrimesTable } from './primes-panels';
import { ProvenanceLine } from './provenance-line';
import { WindowPresets } from './window-presets';

export interface PrimesLensProps {
  scope: ScopeQuery;
  /** The size of subcontract to count: the active profile's; absent counts every size. */
  band?: AmountRange;
  preset: WindowPreset;
  onPresetChange(preset: WindowPreset): void;
  hiredHrefOf(uei: string): string;
  /** Show one firm's own row of the ranking opened out, in place of the ranking and its tiles. */
  only?: string;
}

/** The UEIs tracked as firms — read once per ranking, so each row can say whether it is tracked without a read of its own. */
const trackedFirms = async (signal: AbortSignal): Promise<ReadonlySet<string>> => {
  const listed = await api.listTargets({ kind: 'firm', limit: MAX_PIPELINE_LIMIT }, { signal });
  return new Set(listed.data.map((target) => target.subject));
};

/** Who passes work down: the scope's primes ranked by the subcontracts they reported, over one window and one size of subcontract; the last answer stays in view, marked busy, while the next loads. A prime is tracked as a firm from its row, at the first stage of a firm's pursuit, never over one already tracked. */
export function PrimesLens({
  scope,
  band,
  preset,
  onPresetChange,
  hiredHrefOf,
  only,
}: PrimesLensProps) {
  const window = windowOf(preset, Date.now());
  const query = { ...scope, from: window.from, to: window.to, band };
  const key = JSON.stringify(query);
  const primes = useResource((signal) => api.getSpendingPrimes(query, { signal }), [key]);
  const [message, setMessage] = useState('');
  const tracked = useResource(
    (signal) => (only === undefined ? trackedFirms(signal) : Promise.resolve(new Set<string>())),
    [only],
  );
  const track = useAction(async (row: PrimeRow) => {
    if (row.uei === null) return;
    // One already tracked keeps its stage: the row read as untracked only because the list is bounded.
    const target =
      (await api.getTarget('firm', row.uei)) ??
      (await api.saveTarget('firm', row.uei, { label: row.name, stage: TARGET_STAGES.firm[0] }));
    tracked.replace(new Set([...(tracked.data ?? []), target.subject]));
    setMessage(`${target.label} tracked as ${target.stage}.`);
  });
  return (
    <Stack gap={4}>
      <WindowPresets preset={preset} onPresetChange={onPresetChange} />
      {primes.error ? <Alert tone="danger">{primes.error}</Alert> : null}
      {track.error ? <Alert tone="danger">{track.error}</Alert> : null}
      {primes.data ? (
        <BusyRegion busy={primes.loading}>
          <Stack gap={4}>
            {only === undefined ? (
              <>
                <PrimesSummary primes={primes.data} />
                <PrimesTable
                  rows={primes.data.primes}
                  primeCount={primes.data.primeCount}
                  hiredHrefOf={hiredHrefOf}
                  tracked={tracked.data ?? new Set<string>()}
                  onTrack={(row) => void track.run(row)}
                  tracking={track.pending}
                />
              </>
            ) : (
              <>
                <PrimeRecord uei={only} rows={primes.data.primes} hiredHrefOf={hiredHrefOf} />
                <PrimesReadLine primes={primes.data} />
              </>
            )}
            <ProvenanceLine provenance={primes.data.provenance} />
          </Stack>
        </BusyRegion>
      ) : primes.error ? null : (
        <Stack gap={2}>
          <Spinner label={LENS_LOADING.primes} />
          <Text tone="muted" size="sm">
            {FIRST_LOOK_NOTE}
          </Text>
        </Stack>
      )}
      <LiveRegion message={message} />
    </Stack>
  );
}
