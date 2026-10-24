import {
  day,
  TARGET_ACTIVITY_KINDS,
  type TargetActivity,
  type TargetActivityKind,
} from '@sysdesign/contracts';
import { Badge, Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';
import { useState } from 'react';

import { fromReminderInput, toReminderInput } from '../reminder-input';
import { TARGET_ACTIVITY_KIND_LABEL } from './target-kinds';

export interface TargetActivityLogProps {
  activity: readonly TargetActivity[];
  onChange(next: TargetActivity[]): void;
  /** The instant a new entry defaults to. */
  nowMs: number;
  disabled?: boolean;
}

const newestFirst = (activity: readonly TargetActivity[]): TargetActivity[] =>
  [...activity].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/** What was done about a target, newest first, and one row to log the next thing: of a declared kind, when (UTC), in a line. */
export function TargetActivityLog({
  activity,
  onChange,
  nowMs,
  disabled = false,
}: TargetActivityLogProps) {
  const [kind, setKind] = useState<TargetActivityKind>('emailed');
  const [when, setWhen] = useState(() => toReminderInput(new Date(nowMs).toISOString()));
  const [summary, setSummary] = useState('');
  const log = () => {
    onChange([
      ...activity,
      {
        at: fromReminderInput(when) ?? new Date(nowMs).toISOString(),
        kind,
        summary: summary.trim(),
        ref: null,
      },
    ]);
    setSummary('');
  };
  return (
    <Stack gap={2} aria-label="Activity" role="group">
      <Text tone="secondary" size="sm">
        Activity
      </Text>
      {activity.length === 0 ? (
        <Text tone="muted" size="sm">
          Nothing logged yet.
        </Text>
      ) : (
        <Stack as="ul" gap={1} aria-label="Activity log">
          {newestFirst(activity).map((entry) => (
            <li key={`${entry.at}|${entry.kind}|${entry.summary}`}>
              <Stack direction="row" gap={2} align="center" wrap>
                <span>{day(entry.at)}</span>
                <Badge tone="neutral">{TARGET_ACTIVITY_KIND_LABEL[entry.kind]}</Badge>
                <span>{entry.summary}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove the entry of ${day(entry.at)}: ${TARGET_ACTIVITY_KIND_LABEL[entry.kind]}`}
                  disabled={disabled}
                  onClick={() => onChange(activity.filter((item) => item !== entry))}
                >
                  ✕
                </Button>
              </Stack>
            </li>
          ))}
        </Stack>
      )}
      <Stack direction="row" gap={2} align="end" wrap>
        <SelectField
          label="Logged activity"
          value={kind}
          disabled={disabled}
          onChange={(event) => setKind(event.target.value as TargetActivityKind)}
        >
          {TARGET_ACTIVITY_KINDS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {TARGET_ACTIVITY_KIND_LABEL[candidate]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="When (UTC)"
          type="datetime-local"
          value={when}
          disabled={disabled}
          onChange={(event) => setWhen(event.target.value)}
        />
        <TextField
          label="What happened"
          value={summary}
          disabled={disabled}
          onChange={(event) => setSummary(event.target.value)}
        />
        <Button type="button" variant="subtle" size="sm" disabled={disabled} onClick={log}>
          Log
        </Button>
      </Stack>
    </Stack>
  );
}
