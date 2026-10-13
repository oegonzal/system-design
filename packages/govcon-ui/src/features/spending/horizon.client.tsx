'use client';

import { DEFAULT_HORIZON_MONTHS, type ScopeQuery } from '@sysdesign/contracts';
import { Alert, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { FIRST_LOOK_NOTE, LENS_LOADING } from './costs';
import { HorizonChart, HorizonMonths, HorizonTable, HorizonTiles } from './horizon-panels';
import { ProvenanceLine } from './provenance-line';

const ROWS_PER_PAGE = 25;

export interface HorizonLensProps {
  scope: ScopeQuery;
}

/** What is coming up: the scope's awards ending inside the months ahead. */
export function HorizonLens({ scope }: HorizonLensProps) {
  const [months, setMonths] = useState<number>(DEFAULT_HORIZON_MONTHS);
  const query = { ...scope, months };
  const key = JSON.stringify(query);
  const horizon = useResource((signal) => api.getSpendingHorizon(query, { signal }), [key]);
  // The page belongs to one answer: a new query starts from its first page.
  const [paging, setPaging] = useState({ key, offset: 0 });
  const offset = paging.key === key ? paging.offset : 0;
  return (
    <Stack gap={4}>
      <HorizonMonths value={months} onChange={setMonths} />
      {horizon.error ? <Alert tone="danger">{horizon.error}</Alert> : null}
      {horizon.data ? (
        <>
          <HorizonTiles horizon={horizon.data} />
          <HorizonChart horizon={horizon.data} pending={horizon.loading} />
          <HorizonTable
            rows={horizon.data.rows}
            offset={offset}
            limit={ROWS_PER_PAGE}
            onPage={(next) => setPaging({ key, offset: next })}
          />
          <ProvenanceLine provenance={horizon.data.provenance} />
        </>
      ) : horizon.error ? null : (
        <Stack gap={2}>
          <Spinner label={LENS_LOADING.horizon} />
          <Text tone="muted" size="sm">
            {FIRST_LOOK_NOTE}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
