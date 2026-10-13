import {
  AWARD_FAMILY_CHOICES,
  type AgencyDirectoryEntry,
  type AwardFamilyChoice,
} from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { codesOf } from '../codes';
import { AWARD_FAMILY_LABEL, SPENDING_COST } from './costs';
import { toggleCode, type ScopeDraft } from './scope';

export interface ScopeBarProps {
  value: ScopeDraft;
  onChange(next: ScopeDraft): void;
  /** The active profile's NAICS codes, as one-click chips. */
  naicsOptions: readonly string[];
  /** The agency directory; null while it loads. */
  agencies: readonly AgencyDirectoryEntry[] | null;
  agenciesError?: string | null;
  disabled?: boolean;
}

/** What every lens is scoped by: code families, one awarding agency, one or both award families. */
export function ScopeBar({
  value,
  onChange,
  naicsOptions,
  agencies,
  agenciesError = null,
  disabled = false,
}: ScopeBarProps) {
  const chosen = codesOf(value.naics);
  const sorted =
    agencies === null ? [] : [...agencies].sort((a, b) => a.name.localeCompare(b.name));
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
            selected={chosen.includes(code)}
            aria-pressed={chosen.includes(code)}
            disabled={disabled}
            onClick={() => onChange({ ...value, naics: toggleCode(value.naics, code) })}
          >
            {code}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="NAICS codes"
          hint="Codes or families, comma-separated"
          value={value.naics}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, naics: event.target.value })}
        />
        <TextField
          label="PSC codes"
          value={value.psc}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, psc: event.target.value.toUpperCase() })}
        />
        <SelectField
          label="Agency"
          value={value.agency}
          disabled={disabled || agencies === null}
          hint={agenciesError ?? (agencies === null ? 'Loading the directory…' : undefined)}
          onChange={(event) => onChange({ ...value, agency: event.target.value })}
        >
          <option value="">any</option>
          {sorted.map((agency) => (
            <option key={agency.toptierCode} value={agency.toptierCode}>
              {agency.abbreviation ? `${agency.abbreviation} — ${agency.name}` : agency.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Award family"
          value={value.awardFamily}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, awardFamily: event.target.value as AwardFamilyChoice })
          }
        >
          {AWARD_FAMILY_CHOICES.map((family) => (
            <option key={family} value={family}>
              {AWARD_FAMILY_LABEL[family]}
            </option>
          ))}
        </SelectField>
      </Stack>
      <Text tone="muted" size="sm">
        {SPENDING_COST}
      </Text>
    </Stack>
  );
}
