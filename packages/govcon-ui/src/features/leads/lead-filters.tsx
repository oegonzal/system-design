import { LEAD_TIERS, MAX_LEAD_LIMIT, type LeadTier } from '@sysdesign/contracts';
import { SelectField, Stack, TextField } from '@sysdesign/design-system';

export interface LeadFilters {
  minScore: number;
  tier: LeadTier | null;
  limit: number;
}

export const DEFAULT_LEAD_FILTERS: LeadFilters = { minScore: 0, tier: null, limit: 25 };

const clampScore = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
const clampLimit = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_LEAD_LIMIT, Math.max(1, Math.round(value)))
    : DEFAULT_LEAD_FILTERS.limit;

export interface LeadFiltersProps {
  value: LeadFilters;
  onChange(next: LeadFilters): void;
  disabled?: boolean;
}

/** What the store is asked for: a floor on the score, a tier, a cap on the rows. */
export function LeadFiltersControls({ value, onChange, disabled = false }: LeadFiltersProps) {
  return (
    <Stack direction="row" gap={4} align="end" wrap>
      <TextField
        label="Minimum score"
        type="number"
        min={0}
        max={100}
        value={value.minScore}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...value, minScore: clampScore(event.target.valueAsNumber) })
        }
      />
      <SelectField
        label="Tier"
        value={value.tier ?? 'any'}
        disabled={disabled}
        onChange={(event) =>
          onChange({
            ...value,
            tier: event.target.value === 'any' ? null : (event.target.value as LeadTier),
          })
        }
      >
        <option value="any">any</option>
        {LEAD_TIERS.map((tier) => (
          <option key={tier} value={tier}>
            {tier}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Show up to"
        type="number"
        min={1}
        max={MAX_LEAD_LIMIT}
        value={value.limit}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, limit: clampLimit(event.target.valueAsNumber) })}
      />
    </Stack>
  );
}
