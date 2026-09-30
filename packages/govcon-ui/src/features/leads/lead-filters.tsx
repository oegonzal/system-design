import {
  LEAD_TIERS,
  MAX_LEAD_LIMIT,
  NOTICE_TYPES,
  SET_ASIDE_CODES,
  type LeadTier,
  type ListLeadsQuery,
} from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

/** Everything the store can be asked for, as the form holds it: empty text means "any". */
export interface LeadFilters {
  minScore: number;
  tier: LeadTier | null;
  /** A NAICS code or family the primary code starts with. */
  naics: string;
  setAside: string;
  noticeType: string;
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
  noticeType: '',
  agency: '',
  q: '',
  deadlineWithinDays: null,
  limit: 25,
};

const clampScore = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
const clampLimit = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_LEAD_LIMIT, Math.max(1, Math.round(value)))
    : DEFAULT_LEAD_FILTERS.limit;
const clampDays = (value: number): number | null =>
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
    noticeType: text(filters.noticeType),
    agency: text(filters.agency),
    q: text(filters.q),
    deadlineWithinDays: filters.deadlineWithinDays ?? undefined,
    limit: filters.limit,
    offset,
  };
}

/** The labels SAM.gov gives notice types — what the store matches `noticeType` against. */
const NOTICE_TYPE_LABELS = Object.values(NOTICE_TYPES);
const NO_CHOICES: readonly string[] = [];

export interface LeadFiltersProps {
  value: LeadFilters;
  onChange(next: LeadFilters): void;
  /** The profile's own NAICS codes and families, offered as one-click chips. */
  naicsChoices?: readonly string[];
  disabled?: boolean;
}

/**
 * What the store is asked for: the profile's codes as chips, the codes and
 * words a notice must carry, a floor on the score, a tier, a deadline
 * horizon, a cap on the rows. Every field maps to one query parameter of
 * `GET /leads`; nothing here spends a request.
 */
export function LeadFiltersControls({
  value,
  onChange,
  naicsChoices = NO_CHOICES,
  disabled = false,
}: LeadFiltersProps) {
  const set = <K extends keyof LeadFilters>(key: K, next: LeadFilters[K]) =>
    onChange({ ...value, [key]: next });
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
              selected={value.naics === code}
              disabled={disabled}
              onClick={() => set('naics', value.naics === code ? '' : code)}
            >
              {code}
            </Button>
          ))}
        </Stack>
      ) : null}
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="NAICS code or family"
          value={value.naics}
          disabled={disabled}
          onChange={(event) => set('naics', event.target.value)}
        />
        <SelectField
          label="Set-aside"
          value={value.setAside}
          disabled={disabled}
          onChange={(event) => set('setAside', event.target.value)}
        >
          <option value="">any</option>
          {SET_ASIDE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Notice type"
          value={value.noticeType}
          disabled={disabled}
          onChange={(event) => set('noticeType', event.target.value)}
        >
          <option value="">any</option>
          {NOTICE_TYPE_LABELS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Agency contains"
          value={value.agency}
          disabled={disabled}
          onChange={(event) => set('agency', event.target.value)}
        />
        <TextField
          label="Title or solicitation contains"
          value={value.q}
          disabled={disabled}
          onChange={(event) => set('q', event.target.value)}
        />
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="Minimum score"
          type="number"
          min={0}
          max={100}
          value={value.minScore}
          disabled={disabled}
          onChange={(event) => set('minScore', clampScore(event.target.valueAsNumber))}
        />
        <SelectField
          label="Tier"
          value={value.tier ?? 'any'}
          disabled={disabled}
          onChange={(event) =>
            set('tier', event.target.value === 'any' ? null : (event.target.value as LeadTier))
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
          value={value.deadlineWithinDays ?? ''}
          disabled={disabled}
          onChange={(event) => set('deadlineWithinDays', clampDays(event.target.valueAsNumber))}
        />
        <TextField
          label="Show up to"
          type="number"
          min={1}
          max={MAX_LEAD_LIMIT}
          value={value.limit}
          disabled={disabled}
          onChange={(event) => set('limit', clampLimit(event.target.valueAsNumber))}
        />
      </Stack>
    </Stack>
  );
}
