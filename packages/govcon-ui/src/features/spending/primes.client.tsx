'use client';

import {
  windowOf,
  type AmountRange,
  type ScopeQuery,
  type WindowPreset,
} from '@sysdesign/contracts';
import { Alert, BusyRegion, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

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

/** Who passes work down: the scope's primes ranked by the subcontracts they reported, over one window and one size of subcontract; the last answer stays in view, marked busy, while the next loads. */
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
  return (
    <Stack gap={4}>
      <WindowPresets preset={preset} onPresetChange={onPresetChange} />
      {primes.error ? <Alert tone="danger">{primes.error}</Alert> : null}
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
    </Stack>
  );
}
