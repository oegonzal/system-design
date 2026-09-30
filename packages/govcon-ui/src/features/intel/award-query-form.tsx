import type { AwardSource } from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { AWARD_SOURCE_LABEL, AWARD_SOURCE_OPTIONS } from './costs';

/** The store-side filters of the awards list and summary, as the form holds them; empty means unfiltered. */
export interface AwardFilters {
  naics: string;
  psc: string;
  agency: string;
  from: string;
  to: string;
  source: AwardSource | '';
}

export const EMPTY_AWARD_FILTERS: AwardFilters = {
  naics: '',
  psc: '',
  agency: '',
  from: '',
  to: '',
  source: '',
};

export interface AwardQueryFormProps {
  value: AwardFilters;
  onChange(next: AwardFilters): void;
  /** The active profile's NAICS codes, as one-click chips. */
  naicsOptions: readonly string[];
  disabled?: boolean;
}

/** What the store is asked for: a NAICS family (the profile's codes one click away), a PSC, an agency, a signed window, a source. */
export function AwardQueryForm({
  value,
  onChange,
  naicsOptions,
  disabled = false,
}: AwardQueryFormProps) {
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={2} wrap align="center">
        <Text as="span" tone="secondary" size="sm">
          Profile NAICS
        </Text>
        {naicsOptions.map((code) => (
          <Button
            key={code}
            type="button"
            variant="subtle"
            size="sm"
            selected={value.naics === code}
            aria-pressed={value.naics === code}
            disabled={disabled}
            onClick={() => onChange({ ...value, naics: value.naics === code ? '' : code })}
          >
            {code}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="NAICS (code or family)"
          value={value.naics}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, naics: event.target.value.trim() })}
        />
        <TextField
          label="PSC"
          value={value.psc}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, psc: event.target.value.trim().toUpperCase() })}
        />
        <TextField
          label="Agency contains"
          value={value.agency}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, agency: event.target.value })}
        />
        <TextField
          label="Signed from"
          type="date"
          value={value.from}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
        <TextField
          label="Signed to"
          type="date"
          value={value.to}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
        <SelectField
          label="Source"
          value={value.source}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, source: event.target.value as AwardSource | '' })
          }
        >
          <option value="">any</option>
          {AWARD_SOURCE_OPTIONS.map((source) => (
            <option key={source} value={source}>
              {AWARD_SOURCE_LABEL[source]}
            </option>
          ))}
        </SelectField>
      </Stack>
    </Stack>
  );
}
