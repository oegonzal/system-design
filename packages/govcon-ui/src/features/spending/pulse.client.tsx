'use client';

import { DEFAULT_PULSE_LOOKBACK_YEARS, type ScopeQuery } from '@sysdesign/contracts';
import { Alert, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { FIRST_LOOK_NOTE, LENS_LOADING } from './costs';
import { ProvenanceLine } from './provenance-line';
import { pulseFigures } from './pulse-figures';
import { PulseChart, PulseTiles } from './pulse-panels';

export interface PulseLensProps {
  scope: ScopeQuery;
}

/** When the money moves: one read per scope, held in view while the next one loads. */
export function PulseLens({ scope }: PulseLensProps) {
  const key = JSON.stringify(scope);
  const pulse = useResource(
    (signal) =>
      api.getSpendingPulse({ ...scope, lookback: DEFAULT_PULSE_LOOKBACK_YEARS }, { signal }),
    [key],
  );
  return (
    <Stack gap={4}>
      {pulse.error ? <Alert tone="danger">{pulse.error}</Alert> : null}
      {pulse.data ? (
        <>
          <PulseTiles figures={pulseFigures(pulse.data)} />
          <PulseChart pulse={pulse.data} pending={pulse.loading} />
          <ProvenanceLine provenance={pulse.data.provenance} />
        </>
      ) : pulse.error ? null : (
        <Stack gap={2}>
          <Spinner label={LENS_LOADING.pulse} />
          <Text tone="muted" size="sm">
            {FIRST_LOOK_NOTE}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
