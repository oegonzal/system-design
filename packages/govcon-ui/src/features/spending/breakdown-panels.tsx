import {
  BREAKDOWN_CATEGORIES,
  compactMoney,
  money,
  WINDOW_PRESETS,
  type BreakdownCategory,
  type SpendingBreakdown,
  type WindowPreset,
} from '@sysdesign/contracts';
import { BarList, Button, SelectField, Stack, StatTile, Text } from '@sysdesign/design-system';

import { BREAKDOWN_CATEGORY_LABEL } from './costs';

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
      <Stack direction="row" gap={2} wrap align="center" role="group" aria-label="Window">
        {WINDOW_PRESETS.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant="subtle"
            size="sm"
            selected={preset === option.id}
            aria-pressed={preset === option.id}
            disabled={disabled}
            onClick={() => onPresetChange(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

export interface BreakdownListProps {
  breakdown: SpendingBreakdown;
}

/** The scope's whole over the window, then the ranked rows as shares of it. */
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
