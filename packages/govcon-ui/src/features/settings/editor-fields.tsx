import type { DayBand, Interest } from '@sysdesign/contracts';
import { Alert, Badge, Button, Heading, Stack, Text, TextField } from '@sysdesign/design-system';
import { useState, type ReactNode } from 'react';

/** One problem the service found, at a dotted path into the document — `scoring.weights`, `naics.0`. */
export interface ProfileIssue {
  path: string;
  message: string;
}

/** The issues at `path` or beneath it. */
export const issuesAt = (issues: readonly ProfileIssue[], path: string): ProfileIssue[] =>
  issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));

/** The service's issues for one field, beside it. */
export function FieldIssues({ issues, path }: { issues: readonly ProfileIssue[]; path: string }) {
  const own = issuesAt(issues, path);
  if (own.length === 0) return null;
  return (
    <Stack gap={2}>
      {own.map((issue) => (
        <Alert key={`${issue.path}:${issue.message}`} tone="danger" data-path={issue.path}>
          {issue.path === path
            ? issue.message
            : `${issue.path.slice(path.length + 1)}: ${issue.message}`}
        </Alert>
      ))}
    </Stack>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap={3}>
      <Heading level={3}>{title}</Heading>
      {hint ? (
        <Text tone="secondary" size="sm">
          {hint}
        </Text>
      ) : null}
      {children}
    </Stack>
  );
}

const numberOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export interface NumberFieldProps {
  label: string;
  value: number;
  onChange(next: number): void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

/** A number the document holds; an unreadable entry keeps the last value. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any' as unknown as number,
  disabled,
}: NumberFieldProps) {
  return (
    <TextField
      label={label}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => onChange(numberOr(event.target.valueAsNumber, value))}
    />
  );
}

export interface CodeChipsProps {
  label: string;
  codes: readonly string[];
  onChange(next: string[]): void;
  placeholder?: string;
  /** Applied to what is typed before it joins the list. */
  normalize?: (code: string) => string;
  disabled?: boolean;
}

const trimmed = (code: string) => code.trim();

/** A list of codes — NAICS, PSC, excluded types — as chips with a remove each, and one field to add. */
export function CodeChips({
  label,
  codes,
  onChange,
  placeholder,
  normalize = trimmed,
  disabled,
}: CodeChipsProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const code = normalize(draft);
    if (code.length === 0) return;
    if (!codes.includes(code)) onChange([...codes, code]);
    setDraft('');
  };
  return (
    <Stack gap={2}>
      {codes.length === 0 ? (
        <Text as="p" tone="muted" size="sm">
          {label}: none
        </Text>
      ) : (
        <Stack direction="row" gap={2} wrap align="center" role="list" aria-label={label}>
          {codes.map((code) => (
            <Stack key={code} as="div" direction="row" gap={1} align="center" role="listitem">
              <Badge>{code}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${code} from ${label}`}
                disabled={disabled}
                onClick={() => onChange(codes.filter((item) => item !== code))}
              >
                ✕
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
      <Stack direction="row" gap={2} align="end" wrap>
        <TextField
          label={`Add to ${label}`}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="subtle" size="sm" disabled={disabled} onClick={add}>
          Add
        </Button>
      </Stack>
    </Stack>
  );
}

export interface PriceRowsProps {
  label: string;
  prices: Record<string, number>;
  onChange(next: Record<string, number>): void;
  keyLabel: string;
  disabled?: boolean;
}

/** An open price map — set-aside by code, notice type by label — one row per entry, a value in [0, 1]. */
export function PriceRows({ label, prices, onChange, keyLabel, disabled }: PriceRowsProps) {
  const [draft, setDraft] = useState('');
  const entries = Object.entries(prices);
  const set = (key: string, value: number) => onChange({ ...prices, [key]: value });
  const remove = (key: string) => {
    const next = { ...prices };
    delete next[key];
    onChange(next);
  };
  const add = () => {
    const key = draft.trim();
    if (key.length === 0 || key in prices) return;
    onChange({ ...prices, [key]: 1 });
    setDraft('');
  };
  return (
    <Stack gap={2} aria-label={label} role="group">
      {entries.length === 0 ? (
        <Text tone="muted" size="sm">
          none priced
        </Text>
      ) : (
        entries.map(([key, value]) => (
          <Stack key={key} direction="row" gap={2} align="end" wrap>
            <Text as="span">{key}</Text>
            <NumberField
              label={`${label} ${key}`}
              value={value}
              min={0}
              max={1}
              step={0.05}
              disabled={disabled}
              onChange={(next) => set(key, next)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${key} from ${label}`}
              disabled={disabled}
              onClick={() => remove(key)}
            >
              ✕
            </Button>
          </Stack>
        ))
      )}
      <Stack direction="row" gap={2} align="end" wrap>
        <TextField
          label={`New ${keyLabel}`}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="button" variant="subtle" size="sm" disabled={disabled} onClick={add}>
          Add
        </Button>
      </Stack>
    </Stack>
  );
}

export interface BandRowsProps {
  label: string;
  bands: readonly DayBand[];
  onChange(next: DayBand[]): void;
  disabled?: boolean;
}

/** Ascending day bands — the first the days fit takes it. */
export function BandRows({ label, bands, onChange, disabled }: BandRowsProps) {
  const set = (index: number, patch: Partial<DayBand>) =>
    onChange(bands.map((band, at) => (at === index ? { ...band, ...patch } : band)));
  return (
    <Stack gap={2} aria-label={label} role="group">
      {bands.map((band, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- a band is its position; it has no id
        <Stack key={index} direction="row" gap={2} align="end" wrap>
          <NumberField
            label={`${label} band ${index + 1} up to days`}
            value={band.maxDays}
            min={0}
            step={1}
            disabled={disabled}
            onChange={(maxDays) => set(index, { maxDays })}
          />
          <NumberField
            label={`${label} band ${index + 1} value`}
            value={band.value}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            onChange={(value) => set(index, { value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove ${label} band ${index + 1}`}
            disabled={disabled}
            onClick={() => onChange(bands.filter((_, at) => at !== index))}
          >
            ✕
          </Button>
        </Stack>
      ))}
      <Button
        type="button"
        variant="subtle"
        size="sm"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...bands,
            { maxDays: (bands[bands.length - 1]?.maxDays ?? 0) + 30, value: 0.5 },
          ])
        }
      >
        Add band
      </Button>
    </Stack>
  );
}

export interface InterestRowsProps {
  interests: readonly Interest[];
  onChange(next: Interest[]): void;
  disabled?: boolean;
}

/** Declared phrases with aliases and a weight; matched as whole tokens in a title. */
export function InterestRows({ interests, onChange, disabled }: InterestRowsProps) {
  const set = (index: number, patch: Partial<Interest>) =>
    onChange(
      interests.map((interest, at) => (at === index ? { ...interest, ...patch } : interest)),
    );
  return (
    <Stack gap={2} aria-label="Interests" role="group">
      {interests.map((interest, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- an interest row is its position while it is edited
        <Stack key={index} direction="row" gap={2} align="end" wrap>
          <TextField
            label={`Interest ${index + 1} term`}
            value={interest.term}
            disabled={disabled}
            onChange={(event) => set(index, { term: event.target.value })}
          />
          <TextField
            label={`Interest ${index + 1} aliases`}
            value={interest.aliases.join(', ')}
            disabled={disabled}
            onChange={(event) =>
              set(index, {
                aliases: event.target.value
                  .split(',')
                  .map((alias) => alias.trim())
                  .filter((alias) => alias.length > 0),
              })
            }
          />
          <NumberField
            label={`Interest ${index + 1} weight`}
            value={interest.weight}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            onChange={(weight) => set(index, { weight })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove interest ${index + 1}`}
            disabled={disabled}
            onClick={() => onChange(interests.filter((_, at) => at !== index))}
          >
            ✕
          </Button>
        </Stack>
      ))}
      <Button
        type="button"
        variant="subtle"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...interests, { term: '', aliases: [], weight: 0.5 }])}
      >
        Add interest
      </Button>
    </Stack>
  );
}
