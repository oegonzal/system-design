import type { AwardSource, FetchAwardsReport, FetchAwardsRequest } from '@sysdesign/contracts';
import {
  Badge,
  Button,
  CheckboxField,
  Heading,
  Stack,
  Table,
  Text,
  TextField,
} from '@sysdesign/design-system';
import { useState } from 'react';

import { SLICE_OUTCOME_TONE } from '../tones';
import { AWARD_SOURCE_COST, AWARD_SOURCE_LABEL, AWARD_SOURCE_OPTIONS, FETCH_COST } from './costs';

export interface FetchAwardsFormProps {
  /** The codes the form starts with — the active profile's. */
  defaultNaics: readonly string[];
  onFetch(request: FetchAwardsRequest): void;
  pending?: boolean;
  report?: FetchAwardsReport | null;
}

/** `a, b c` → `['a', 'b', 'c']`. */
export const codesOf = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter((code) => code.length > 0);

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The one form that spends on awards: which codes, which signed window, and
 * which sources — each with its cost beside its checkbox, so the click knows
 * what it costs before it is made.
 */
export function FetchAwardsForm({
  defaultNaics,
  onFetch,
  pending = false,
  report = null,
}: FetchAwardsFormProps) {
  const [naics, setNaics] = useState(defaultNaics.join(', '));
  const [psc, setPsc] = useState('');
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [sources, setSources] = useState<AwardSource[]>([...AWARD_SOURCE_OPTIONS]);

  const codes = codesOf(naics);
  const pscCodes = codesOf(psc);
  const ready = codes.length + pscCodes.length > 0 && sources.length > 0 && from <= to;

  const toggle = (source: AwardSource) =>
    setSources((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source],
    );

  return (
    <Stack gap={4}>
      <Heading level={3}>Fetch awards</Heading>
      <Stack direction="row" gap={4} align="end" wrap>
        <TextField
          label="NAICS codes"
          value={naics}
          disabled={pending}
          onChange={(event) => setNaics(event.target.value)}
        />
        <TextField
          label="PSC codes"
          value={psc}
          disabled={pending}
          onChange={(event) => setPsc(event.target.value.toUpperCase())}
        />
        <TextField
          label="Signed from"
          type="date"
          value={from}
          disabled={pending}
          onChange={(event) => setFrom(event.target.value)}
        />
        <TextField
          label="Signed to"
          type="date"
          value={to}
          disabled={pending}
          onChange={(event) => setTo(event.target.value)}
        />
      </Stack>
      <Stack gap={2}>
        {AWARD_SOURCE_OPTIONS.map((source) => (
          <CheckboxField
            key={source}
            label={`${AWARD_SOURCE_LABEL[source]} — ${AWARD_SOURCE_COST[source]}`}
            checked={sources.includes(source)}
            disabled={pending}
            onChange={() => toggle(source)}
          />
        ))}
      </Stack>
      <Stack direction="row" gap={3} align="center" wrap>
        <Button
          type="button"
          variant="solid"
          size="md"
          disabled={pending || !ready}
          onClick={() =>
            onFetch({
              naics: codes,
              psc: pscCodes.length > 0 ? pscCodes : undefined,
              from,
              to,
              sources,
            })
          }
        >
          {pending ? 'Fetching…' : 'Fetch'}
        </Button>
        <Text tone="secondary" size="sm">
          {sources.includes('sam.gov') ? FETCH_COST.budgeted : FETCH_COST.free}
        </Text>
      </Stack>
      {report ? <FetchReport report={report} /> : null}
    </Stack>
  );
}

/** The fetch as it went: one row per source and code. */
export function FetchReport({ report }: { report: FetchAwardsReport }) {
  return (
    <Stack gap={2}>
      <Table aria-label="Fetch report">
        <thead>
          <tr>
            <th>Source</th>
            <th>Code</th>
            <th>Outcome</th>
            <th>Pages</th>
            <th>Received</th>
            <th>Inserted</th>
            <th>Updated</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {report.slices.map((slice) => (
            <tr key={`${slice.source}:${slice.code}`}>
              <td>{slice.source}</td>
              <td>{slice.code}</td>
              <td>
                <Badge tone={SLICE_OUTCOME_TONE[slice.outcome]}>{slice.outcome}</Badge>
              </td>
              <td>{slice.pages}</td>
              <td>{slice.received}</td>
              <td>{slice.inserted}</td>
              <td>{slice.updated}</td>
              <td>
                {slice.truncated ? 'truncated' : ''}
                {slice.truncated && slice.detail ? ' · ' : ''}
                {slice.detail ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Text tone="secondary" size="sm">
        {report.spent === null ? '?' : report.spent} of {report.budget} SAM.gov attempts used in the
        last 24 h.
      </Text>
    </Stack>
  );
}
