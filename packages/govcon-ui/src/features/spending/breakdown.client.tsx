'use client';

import {
  windowOf,
  type BreakdownCategory,
  type ScopeQuery,
  type WindowPreset,
} from '@sysdesign/contracts';
import { Alert, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { BreakdownControls, BreakdownList } from './breakdown-panels';
import { FIRST_LOOK_NOTE, LENS_LOADING } from './costs';
import { ProvenanceLine } from './provenance-line';

export interface BreakdownLensProps {
  scope: ScopeQuery;
  category: BreakdownCategory;
  onCategoryChange(category: BreakdownCategory): void;
  preset: WindowPreset;
  onPresetChange(preset: WindowPreset): void;
}

/** Where the money goes: the scope ranked by one category over one window, both chosen by the page. */
export function BreakdownLens({
  scope,
  category,
  onCategoryChange,
  preset,
  onPresetChange,
}: BreakdownLensProps) {
  const window = windowOf(preset, Date.now());
  const query = { ...scope, category, from: window.from, to: window.to };
  const key = JSON.stringify(query);
  const breakdown = useResource((signal) => api.getSpendingBreakdown(query, { signal }), [key]);
  return (
    <Stack gap={4}>
      <BreakdownControls
        category={category}
        onCategoryChange={onCategoryChange}
        preset={preset}
        onPresetChange={onPresetChange}
      />
      {breakdown.error ? <Alert tone="danger">{breakdown.error}</Alert> : null}
      {breakdown.data ? (
        <>
          <BreakdownList breakdown={breakdown.data} />
          <ProvenanceLine provenance={breakdown.data.provenance} />
        </>
      ) : breakdown.error ? null : (
        <Stack gap={2}>
          <Spinner label={LENS_LOADING.where} />
          <Text tone="muted" size="sm">
            {FIRST_LOOK_NOTE}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
