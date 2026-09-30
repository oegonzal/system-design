import {
  MAX_PULL_DAYS,
  MIN_PULL_DAYS,
  NOTICE_STATUSES,
  NOTICE_TYPES,
  SET_ASIDE_CODES,
  type NoticeStatus,
  type NoticeTypeCode,
  type QueryFilter,
} from '@sysdesign/contracts';
import { Button, Heading, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

/** The free-text fields of a `QueryFilter`, as the form lists them — one row each, in this order. */
const TEXT_FIELDS: readonly {
  key: Exclude<keyof QueryFilter, 'noticeType' | 'setAside' | 'status'>;
  label: string;
  type?: 'text' | 'date';
}[] = [
  { key: 'naics', label: 'NAICS (exact code, 2–6 digits)' },
  { key: 'psc', label: 'PSC' },
  { key: 'title', label: 'Title contains' },
  { key: 'solicitationNumber', label: 'Solicitation number' },
  { key: 'noticeId', label: 'Notice id' },
  { key: 'state', label: 'State (place of performance)' },
  { key: 'zip', label: 'ZIP' },
  { key: 'organizationName', label: 'Organization name' },
  { key: 'organizationCode', label: 'Organization code' },
  { key: 'deadlineFrom', label: 'Response deadline from', type: 'date' },
  { key: 'deadlineTo', label: 'Response deadline to', type: 'date' },
];

/** A filter with its empties gone — what a run or a save sends. */
export function cleanFilter(filter: QueryFilter): QueryFilter {
  return Object.fromEntries(
    Object.entries(filter).filter(
      ([, value]) => typeof value !== 'string' || value.trim().length > 0,
    ),
  ) as QueryFilter;
}

const clampDays = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_PULL_DAYS, Math.max(MIN_PULL_DAYS, Math.round(value)))
    : MIN_PULL_DAYS;

export interface SearchFilterFormProps {
  filter: QueryFilter;
  onFilterChange(next: QueryFilter): void;
  days: number;
  onDaysChange(days: number): void;
  /** The saved search being edited, when one is loaded into the form. */
  editing: { id: string; name: string } | null;
  name: string;
  onNameChange(name: string): void;
  onRun(): void;
  onSave(): void;
  onCancelEdit(): void;
  running?: boolean;
  saving?: boolean;
  /** Why SAM.gov cannot be called, when it cannot; the run button stays off. */
  sourceDisabledReason?: string | null;
}

/**
 * Every filter SAM.gov's search takes, the window in days, and the two
 * things to do with them: run now (one request per page), or save under a
 * name. Nothing here spends a request by itself.
 */
export function SearchFilterForm({
  filter,
  onFilterChange,
  days,
  onDaysChange,
  editing,
  name,
  onNameChange,
  onRun,
  onSave,
  onCancelEdit,
  running = false,
  saving = false,
  sourceDisabledReason = null,
}: SearchFilterFormProps) {
  const set = <K extends keyof QueryFilter>(key: K, value: QueryFilter[K] | '') =>
    onFilterChange({ ...filter, [key]: value === '' ? undefined : value });
  const busy = running || saving;
  const empty = Object.keys(cleanFilter(filter)).length === 0;
  return (
    <Stack gap={4}>
      <Heading level={3}>{editing ? `Editing "${editing.name}"` : 'Search SAM.gov'}</Heading>
      <Stack direction="row" gap={4} align="end" wrap>
        <SelectField
          label="Notice type"
          value={filter.noticeType ?? ''}
          disabled={busy}
          onChange={(event) => set('noticeType', event.target.value as NoticeTypeCode | '')}
        >
          <option value="">any</option>
          {(Object.keys(NOTICE_TYPES) as NoticeTypeCode[]).map((code) => (
            <option key={code} value={code}>
              {NOTICE_TYPES[code]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Set-aside"
          value={filter.setAside ?? ''}
          disabled={busy}
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
          label="Status"
          value={filter.status ?? ''}
          disabled={busy}
          onChange={(event) => set('status', event.target.value as NoticeStatus | '')}
        >
          <option value="">any</option>
          {NOTICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Posted in the last N days"
          type="number"
          min={MIN_PULL_DAYS}
          max={MAX_PULL_DAYS}
          value={days}
          disabled={busy}
          onChange={(event) => onDaysChange(clampDays(event.target.valueAsNumber))}
        />
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        {TEXT_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            type={field.type ?? 'text'}
            value={filter[field.key] ?? ''}
            disabled={busy}
            onChange={(event) => set(field.key, event.target.value)}
          />
        ))}
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <Button
          variant="solid"
          size="md"
          disabled={busy || empty || sourceDisabledReason !== null}
          onClick={onRun}
        >
          {running ? 'Running…' : 'Run (1 request per page)'}
        </Button>
        <TextField
          label="Save as"
          value={name}
          disabled={busy}
          onChange={(event) => onNameChange(event.target.value)}
        />
        <Button
          variant="subtle"
          size="md"
          disabled={busy || empty || name.trim().length === 0}
          onClick={onSave}
        >
          {saving ? 'Saving…' : editing ? 'Update saved search' : 'Save (no request)'}
        </Button>
        {editing ? (
          <Button variant="ghost" size="md" disabled={busy} onClick={onCancelEdit}>
            Cancel edit
          </Button>
        ) : null}
      </Stack>
      {sourceDisabledReason !== null ? (
        <Text tone="secondary" size="sm">
          SAM.gov cannot be called: {sourceDisabledReason}.
        </Text>
      ) : null}
      <Text tone="muted" size="sm">
        SAM.gov matches the NAICS code exactly (a four-digit family finds nothing); every page of
        results is one request from the daily budget, and what comes back is stored and ranked like
        a pull.
      </Text>
    </Stack>
  );
}
