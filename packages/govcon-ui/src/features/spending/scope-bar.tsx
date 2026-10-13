import {
  AWARD_FAMILY_CHOICES,
  facetParams,
  familyUnder,
  type AgencyDirectoryEntry,
  type AwardFamilyChoice,
  type FacetId,
} from '@sysdesign/contracts';
import {
  ChipGroup,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  SelectField,
  Stack,
  Text,
  TextField,
} from '@sysdesign/design-system';

import { codesOf } from '../codes';
import { AWARD_FAMILY_LABEL, SPENDING_COST } from './costs';
import { FacetControls, type FacetPreset } from './facet-controls';
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
  /** One-press facet settings the profile supplies — its own lanes, say. */
  facetPresets?: Partial<Record<FacetId, FacetPreset>>;
  disabled?: boolean;
}

/**
 * What every lens is scoped by: code families, one awarding agency, one or
 * both award families, and the facets that narrow those. Codes and chips —
 * typed or pressed — are handed on once they pause, so composing a scope is
 * one change; a select or a checkbox is handed on at once. The facets sit
 * behind one fold that says how many are set, and opens by itself when a
 * link arrives with some.
 */
export function ScopeBar({
  value,
  onChange,
  naicsOptions,
  agencies,
  agenciesError = null,
  facetPresets,
  disabled = false,
}: ScopeBarProps) {
  const { shown, settleLater, commit, settleNow } = useSettledDraft(
    value,
    onChange,
    CODES_SETTLE_MS,
  );
  const sorted =
    agencies === null ? [] : [...agencies].sort((a, b) => a.name.localeCompare(b.name));
  const narrowed = Object.keys(facetParams(shown.facets)).length;
  // A placement is a kind of contract: while one is set the family follows it and is not the reader's to change.
  const placed = shown.facets.placement !== null;
  const family = familyUnder(shown.awardFamily, shown.facets);
  return (
    <Stack gap={3}>
      <ChipGroup
        label="Profile NAICS"
        showLabel
        options={naicsOptions.map((code) => ({ id: code, label: code }))}
        value={codesOf(shown.naics)}
        disabled={disabled}
        onToggle={(code) => settleLater({ naics: toggleCode(shown.naics, code) })}
      />
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
          value={family}
          disabled={disabled || placed}
          hint={placed ? 'Set by "Placed as": a kind of contract.' : undefined}
          onChange={(event) => commit({ awardFamily: event.target.value as AwardFamilyChoice })}
        >
          {AWARD_FAMILY_CHOICES.map((family) => (
            <option key={family} value={family}>
              {AWARD_FAMILY_LABEL[family]}
            </option>
          ))}
        </SelectField>
      </Stack>
      <Disclosure defaultOpen={narrowed > 0}>
        <DisclosureButton variant="subtle" size="sm">
          {narrowed === 0 ? 'More filters' : `More filters (${narrowed} set)`}
        </DisclosureButton>
        <DisclosurePanel>
          <FacetControls
            facets={shown.facets}
            onCommit={(facets) => commit({ facets })}
            onSettle={(facets) => settleLater({ facets })}
            presets={facetPresets}
            disabled={disabled}
          />
        </DisclosurePanel>
      </Disclosure>
      <Text tone="muted" size="sm">
        {SPENDING_COST}
      </Text>
    </Stack>
  );
}
