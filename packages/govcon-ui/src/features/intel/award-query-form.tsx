import type { AwardSource } from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { useSettledDraft } from '../use-settled-draft';
import { AWARD_SOURCE_LABEL, AWARD_SOURCE_OPTIONS } from './costs';

/** How long typing pauses before the filters are handed on as one change. */
export const AWARD_FILTERS_SETTLE_MS = 400;

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

/**
 * What the store is asked for: a NAICS family (the profile's codes one click
 * away), a PSC, an agency, a signed window, a source. Typed text is handed
 * on once it pauses, so a word is one change; a chip, a date and a select
 * are handed on at once.
 */
export function AwardQueryForm({
  value,
  onChange,
  naicsOptions,
  disabled = false,
}: AwardQueryFormProps) {
  const { shown, settleLater, commit, settleNow } = useSettledDraft(
    value,
    onChange,
    AWARD_FILTERS_SETTLE_MS,
  );
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
            selected={shown.naics === code}
            aria-pressed={shown.naics === code}
            disabled={disabled}
            onClick={() => commit({ naics: shown.naics === code ? '' : code })}
          >
            {code}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="NAICS (code or family)"
          value={shown.naics}
          disabled={disabled}
          onChange={(event) => settleLater({ naics: event.target.value.trim() })}
          onBlur={settleNow}
        />
        <TextField
          label="PSC"
          value={shown.psc}
          disabled={disabled}
          onChange={(event) => settleLater({ psc: event.target.value.trim().toUpperCase() })}
          onBlur={settleNow}
        />
        <TextField
          label="Agency contains"
          value={shown.agency}
          disabled={disabled}
          onChange={(event) => settleLater({ agency: event.target.value })}
          onBlur={settleNow}
        />
        <TextField
          label="Signed from"
          type="date"
          value={shown.from}
          disabled={disabled}
          onChange={(event) => commit({ from: event.target.value })}
        />
        <TextField
          label="Signed to"
          type="date"
          value={shown.to}
          disabled={disabled}
          onChange={(event) => commit({ to: event.target.value })}
        />
        <SelectField
          label="Source"
          value={shown.source}
          disabled={disabled}
          onChange={(event) => commit({ source: event.target.value as AwardSource | '' })}
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
