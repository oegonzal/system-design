import {
  EARLY_NOTICE_TYPES,
  LEAD_TIERS,
  MAX_LEAD_LIMIT,
  NOTICE_TYPES,
  SET_ASIDE_CODES,
  type LeadTier,
  type ListLeadsQuery,
} from '@sysdesign/contracts';
import { Button, ChipGroup, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { useSettledDraft } from '../use-settled-draft';

/** Everything the store can be asked for, as the form holds it: empty text and no notice type mean "any". */
export interface LeadFilters {
  minScore: number;
  tier: LeadTier | null;
  /** A NAICS code or family the primary code starts with. */
  naics: string;
  setAside: string;
  /** Any of these notice types, by SAM.gov's label; none is every type. */
  noticeTypes: readonly string[];
  agency: string;
  q: string;
  deadlineWithinDays: number | null;
  limit: number;
}

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  minScore: 0,
  tier: null,
  naics: '',
  setAside: '',
  noticeTypes: [],
  agency: '',
  q: '',
  deadlineWithinDays: null,
  limit: 25,
};

/** How long typing or a run of presses pauses before the filters are handed on as one change. */
export const FILTERS_SETTLE_MS = 400;

export const clampScore = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
export const clampLimit = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_LEAD_LIMIT, Math.max(1, Math.round(value)))
    : DEFAULT_LEAD_FILTERS.limit;
export const clampDays = (value: number): number | null =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;

const text = (value: string): string | undefined =>
  value.trim().length > 0 ? value.trim() : undefined;

/** The filters as `GET /leads` takes them: empties dropped, the page named. */
export function toLeadsQuery(
  filters: LeadFilters,
  profile: string | undefined,
  offset: number,
): ListLeadsQuery {
  return {
    profile,
    minScore: filters.minScore,
    tier: filters.tier ?? undefined,
    naics: text(filters.naics),
    setAside: text(filters.setAside),
    noticeTypes: filters.noticeTypes.length > 0 ? [...filters.noticeTypes] : undefined,
    agency: text(filters.agency),
    q: text(filters.q),
    deadlineWithinDays: filters.deadlineWithinDays ?? undefined,
    limit: filters.limit,
    offset,
  };
}

/** The labels SAM.gov gives notice types — what the store matches against. */
export const NOTICE_TYPE_LABELS: readonly string[] = Object.values(NOTICE_TYPES);
const NO_CHOICES: readonly string[] = [];

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));
const toggled = (set: readonly string[], item: string): string[] =>
  set.includes(item) ? set.filter((candidate) => candidate !== item) : [...set, item];

export interface LeadFiltersProps {
  value: LeadFilters;
  onChange(next: LeadFilters): void;
  /** The profile's own NAICS codes and families, offered as one-click chips. */
  naicsChoices?: readonly string[];
  disabled?: boolean;
}

/**
 * What the store is asked for: the profile's codes as chips, the codes and
 * words a notice must carry, the notice types it may be, a floor on the
 * score, a tier, a deadline horizon, a cap on the rows. Every field maps to
 * one query parameter of `GET /leads`; nothing here spends a request. Typed
 * text and runs of chip presses are handed on once they pause, so composing
 * a filter is one change; a select is handed on at once.
 */
export function LeadFiltersControls({
  value,
  onChange,
  naicsChoices = NO_CHOICES,
  disabled = false,
}: LeadFiltersProps) {
  const { shown, settleLater, commit, settleNow } = useSettledDraft(
    value,
    onChange,
    FILTERS_SETTLE_MS,
  );
  const early = sameSet(shown.noticeTypes, EARLY_NOTICE_TYPES);
  return (
    <Stack gap={3}>
      {naicsChoices.length > 0 ? (
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="span" tone="secondary" size="sm">
            Profile NAICS
          </Text>
          {naicsChoices.map((code) => (
            <Button
              key={code}
              size="sm"
              variant="subtle"
              selected={shown.naics === code}
              disabled={disabled}
              onClick={() => commit({ naics: shown.naics === code ? '' : code })}
            >
              {code}
            </Button>
          ))}
        </Stack>
      ) : null}
      <Stack direction="row" gap={3} align="center" wrap>
        <ChipGroup
          label="Notice types"
          showLabel
          options={NOTICE_TYPE_LABELS.map((label) => ({ id: label, label }))}
          value={[...shown.noticeTypes]}
          disabled={disabled}
          onToggle={(label) => settleLater({ noticeTypes: toggled(shown.noticeTypes, label) })}
        />
        <Button
          size="sm"
          variant="subtle"
          selected={early}
          disabled={disabled}
          title="Sources sought and presolicitations: what a buyer posts before it solicits"
          onClick={() => commit({ noticeTypes: early ? [] : [...EARLY_NOTICE_TYPES] })}
        >
          Early notices
        </Button>
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="NAICS code or family"
          value={shown.naics}
          disabled={disabled}
          onChange={(event) => settleLater({ naics: event.target.value })}
          onBlur={settleNow}
        />
        <SelectField
          label="Set-aside"
          value={shown.setAside}
          disabled={disabled}
          onChange={(event) => commit({ setAside: event.target.value })}
        >
          <option value="">any</option>
          {SET_ASIDE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Agency contains"
          value={shown.agency}
          disabled={disabled}
          onChange={(event) => settleLater({ agency: event.target.value })}
          onBlur={settleNow}
        />
        <TextField
          label="Title or solicitation contains"
          value={shown.q}
          disabled={disabled}
          onChange={(event) => settleLater({ q: event.target.value })}
          onBlur={settleNow}
        />
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="Minimum score"
          type="number"
          min={0}
          max={100}
          value={shown.minScore}
          disabled={disabled}
          onChange={(event) => settleLater({ minScore: clampScore(event.target.valueAsNumber) })}
          onBlur={settleNow}
        />
        <SelectField
          label="Tier"
          value={shown.tier ?? 'any'}
          disabled={disabled}
          onChange={(event) =>
            commit({ tier: event.target.value === 'any' ? null : (event.target.value as LeadTier) })
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
          label="Deadline within days"
          type="number"
          min={0}
          value={shown.deadlineWithinDays ?? ''}
          disabled={disabled}
          onChange={(event) =>
            settleLater({ deadlineWithinDays: clampDays(event.target.valueAsNumber) })
          }
          onBlur={settleNow}
        />
        <TextField
          label="Show up to"
          type="number"
          min={1}
          max={MAX_LEAD_LIMIT}
          value={shown.limit}
          disabled={disabled}
          onChange={(event) => settleLater({ limit: clampLimit(event.target.valueAsNumber) })}
          onBlur={settleNow}
        />
      </Stack>
    </Stack>
  );
}
