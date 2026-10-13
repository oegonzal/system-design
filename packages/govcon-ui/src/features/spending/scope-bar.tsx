import {
  AWARD_FAMILY_CHOICES,
  type AgencyDirectoryEntry,
  type AwardFamilyChoice,
} from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { codesOf } from '../codes';
import { AWARD_FAMILY_LABEL, SPENDING_COST } from './costs';
import { toggleCode, type ScopeDraft } from './scope';
import { useSettledDraft } from './use-settled-draft';

/** How long a run of code changes — typed or pressed — may pause before it is handed on as one. A read behind it can cost the source dozens of pages. */
export const CODES_SETTLE_MS = 600;

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

/**
 * What every lens is scoped by: code families, one awarding agency, one or
 * both award families. Codes — typed or pressed — are handed on once they
 * pause, so composing a scope is one change; the agency and the family are
 * handed on at once.
 */
export function ScopeBar({
  value,
  onChange,
  naicsOptions,
  agencies,
  agenciesError = null,
  disabled = false,
}: ScopeBarProps) {
  const { shown, settleLater, commit, settleNow } = useSettledDraft(
    value,
    onChange,
    CODES_SETTLE_MS,
  );
  const chosen = codesOf(shown.naics);
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
            onClick={() => settleLater({ naics: toggleCode(shown.naics, code) })}
          >
            {code}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="NAICS codes"
          hint="Codes or families of 2, 4 or 6 digits, comma-separated"
          value={shown.naics}
          disabled={disabled}
          onChange={(event) => settleLater({ naics: event.target.value })}
          onBlur={settleNow}
        />
        <TextField
          label="PSC codes"
          value={shown.psc}
          disabled={disabled}
          onChange={(event) => settleLater({ psc: event.target.value.toUpperCase() })}
          onBlur={settleNow}
        />
        <SelectField
          label="Agency"
          value={shown.agency}
          disabled={disabled || agencies === null}
          hint={agenciesError ?? (agencies === null ? 'Loading the directory…' : undefined)}
          onChange={(event) => commit({ agency: event.target.value })}
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
          value={shown.awardFamily}
          disabled={disabled}
          onChange={(event) => commit({ awardFamily: event.target.value as AwardFamilyChoice })}
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
