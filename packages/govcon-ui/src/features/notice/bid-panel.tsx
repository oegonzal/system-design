import {
  BID_STAGES,
  day,
  type Bid,
  type BidStage,
  type SaveBidRequest,
} from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  Button,
  Heading,
  SelectField,
  Stack,
  Text,
  TextAreaField,
  TextField,
} from '@sysdesign/design-system';
import { useState } from 'react';

import { BID_STAGE_TONE } from '../tones';

export interface BidPanelProps {
  bid: Bid | null;
  onSave(request: SaveBidRequest): void;
  onRemove(): void;
  /** While a save or remove is in flight. */
  saving?: boolean;
  error?: string | null;
}

interface BidForm {
  stage: BidStage;
  notes: string;
  /** `YYYY-MM-DDTHH:mm`, UTC — the input's own spelling. */
  reminder: string;
  estimatedValue: string;
}

/** ISO 8601 → the datetime-local input's value, read as UTC so the page never depends on the machine's zone. */
export const toReminderInput = (iso: string | null): string =>
  iso === null ? '' : iso.slice(0, 16);
/** The input's value back to ISO 8601, UTC. */
export const fromReminderInput = (value: string): string | null =>
  value === '' ? null : `${value}:00.000Z`;

const formOf = (bid: Bid | null): BidForm => ({
  stage: bid?.stage ?? 'watching',
  notes: bid?.notes ?? '',
  reminder: toReminderInput(bid?.reminderAt ?? null),
  estimatedValue: bid?.estimatedValue === null || bid === null ? '' : String(bid.estimatedValue),
});

/** What the request carries: every field, so a cleared reminder or estimate is written as null. */
export const requestOf = (form: BidForm): SaveBidRequest => ({
  stage: form.stage,
  notes: form.notes,
  reminderAt: fromReminderInput(form.reminder),
  estimatedValue: form.estimatedValue === '' ? null : Number(form.estimatedValue),
});

/** The notice's place in the pipeline: its stage, notes, a reminder and an estimate — saved as one row, removed as one. */
export function BidPanel({ bid, onSave, onRemove, saving = false, error = null }: BidPanelProps) {
  const [form, setForm] = useState<BidForm>(() => formOf(bid));
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={3}>Bid</Heading>
        {bid ? (
          <>
            <Badge tone={BID_STAGE_TONE[bid.stage]}>{bid.stage}</Badge>
            <Text as="span" tone="muted" size="sm">
              in this stage since {day(bid.stageChangedAt)}
            </Text>
          </>
        ) : (
          <Text as="span" tone="muted" size="sm">
            not in the pipeline
          </Text>
        )}
      </Stack>
      <Stack direction="row" gap={4} align="end" wrap>
        <SelectField
          label="Stage"
          value={form.stage}
          disabled={saving}
          onChange={(event) => setForm({ ...form, stage: event.target.value as BidStage })}
        >
          {BID_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Reminder (UTC)"
          type="datetime-local"
          value={form.reminder}
          disabled={saving}
          onChange={(event) => setForm({ ...form, reminder: event.target.value })}
        />
        <TextField
          label="Estimated value (USD)"
          type="number"
          min={0}
          step={1}
          value={form.estimatedValue}
          disabled={saving}
          onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })}
        />
      </Stack>
      <TextAreaField
        label="Notes"
        rows={3}
        value={form.notes}
        disabled={saving}
        onChange={(event) => setForm({ ...form, notes: event.target.value })}
      />
      <Stack direction="row" gap={3} align="center" wrap>
        <Button variant="solid" size="sm" disabled={saving} onClick={() => onSave(requestOf(form))}>
          {saving ? 'Saving…' : bid ? 'Save bid' : 'Track this notice'}
        </Button>
        {bid && (
          <Button variant="subtle" size="sm" disabled={saving} onClick={onRemove}>
            Remove from pipeline
          </Button>
        )}
      </Stack>
      {error && <Alert tone="danger">{error}</Alert>}
    </Stack>
  );
}
