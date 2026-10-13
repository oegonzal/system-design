import {
  BREAKDOWN_CATEGORIES,
  compactMoney,
  money,
  type BreakdownCategory,
  type SpendingBreakdown,
  type WindowPreset,
} from '@sysdesign/contracts';
import { BarList, SelectField, Stack, StatTile, Text } from '@sysdesign/design-system';

import { BREAKDOWN_CATEGORY_LABEL } from './costs';
import { PublicationNote } from './publication-note';
import { WindowPresets } from './window-presets';

export interface BreakdownControlsProps {
  category: BreakdownCategory;
  onCategoryChange(category: BreakdownCategory): void;
  preset: WindowPreset;
  onPresetChange(preset: WindowPreset): void;
  disabled?: boolean;
}

/** One row of filters above the list: the category to rank by, the window to rank over. */
export function BreakdownControls({
  category,
  onCategoryChange,
  preset,
  onPresetChange,
  disabled = false,
}: BreakdownControlsProps) {
  return (
    <Stack direction="row" gap={4} align="end" wrap>
      <SelectField
        label="Rank by"
        value={category}
        disabled={disabled}
        onChange={(event) => onCategoryChange(event.target.value as BreakdownCategory)}
      >
        {BREAKDOWN_CATEGORIES.map((option) => (
          <option key={option} value={option}>
            {BREAKDOWN_CATEGORY_LABEL[option]}
          </option>
        ))}
      </SelectField>
      <WindowPresets preset={preset} onPresetChange={onPresetChange} disabled={disabled} />
    </Stack>
  );
}

export interface BreakdownListProps {
  breakdown: SpendingBreakdown;
}

/** The scope's whole over the window, then the ranked rows as shares of it, and what the window is still missing. */
export function BreakdownList({ breakdown }: BreakdownListProps) {
  const label = BREAKDOWN_CATEGORY_LABEL[breakdown.category];
  return (
    <Stack gap={4}>
      <StatTile
        label="Obligated in the window"
        value={compactMoney(breakdown.total)}
        detail={`${breakdown.from} → ${breakdown.to}`}
        style={{ maxWidth: 280 }}
      />
      <PublicationNote
        delay={breakdown.delay}
        consequence="This window reaches past that day, so the total and every row those awards belong to are short."
      />
      <BarList
        title={`Obligations by ${label}`}
        items={breakdown.rows.map((row) => ({
          id: row.id ?? `${row.code ?? row.name}`,
          label: row.name,
          detail: row.code,
          value: row.amount,
          share: row.share,
        }))}
        formatValue={money}
        emptyMessage={`Nothing obligated by ${label} in the window.`}
      />
      {breakdown.truncated ? (
        <Text tone="muted" size="sm">
          More rows exist beyond the ones shown; the shares are of the whole.
        </Text>
      ) : null}
    </Stack>
  );
}
