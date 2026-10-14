'use client';

import { windowOf, type ReachCut, type ScopeQuery, type WindowPreset } from '@sysdesign/contracts';
import { Alert, BusyRegion, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { FIRST_LOOK_NOTE, LENS_LOADING } from './costs';
import { ProvenanceLine } from './provenance-line';
import { ReachFunnel } from './reach-panels';
import { WindowPresets } from './window-presets';

export interface ReachLensProps {
  scope: ScopeQuery;
  /** The set-aside lanes to count for: the active profile's. */
  lanes: readonly string[];
  preset: WindowPreset;
  onPresetChange(preset: WindowPreset): void;
  hrefOf(cut: ReachCut): string | null;
}

/** What was within reach: the scope's new contracts over one window, cut down to what a firm with these lanes could have won; the last answer stays in view, marked busy, while the next loads. */
export function ReachLens({ scope, lanes, preset, onPresetChange, hrefOf }: ReachLensProps) {
  const window = windowOf(preset, Date.now());
  // Reach names no family: it counts contracts.
  const { awardFamily: _family, ...narrowing } = scope;
  const query = { ...narrowing, from: window.from, to: window.to, lanes: [...lanes] };
  const key = JSON.stringify(query);
  const reach = useResource((signal) => api.getSpendingReach(query, { signal }), [key]);
  return (
    <Stack gap={4}>
      <WindowPresets preset={preset} onPresetChange={onPresetChange} />
      {reach.error ? <Alert tone="danger">{reach.error}</Alert> : null}
      {reach.data ? (
        <BusyRegion busy={reach.loading}>
          <Stack gap={4}>
            <ReachFunnel reach={reach.data} hrefOf={hrefOf} />
            <ProvenanceLine provenance={reach.data.provenance} />
          </Stack>
        </BusyRegion>
      ) : reach.error ? null : (
        <Stack gap={2}>
          <Spinner label={LENS_LOADING.reach} />
          <Text tone="muted" size="sm">
            {FIRST_LOOK_NOTE}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
