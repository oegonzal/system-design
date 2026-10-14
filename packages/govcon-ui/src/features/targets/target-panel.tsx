import {
  day,
  TARGET_STAGES,
  type SaveTargetRequest,
  type Target,
  type TargetKind,
  type TargetStage,
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

import { fromReminderInput, toReminderInput } from '../reminder-input';
import { TARGET_STAGE_TONE } from '../tones';
import { TARGET_KIND_HINT, TARGET_KIND_LABEL } from './target-kinds';

export interface TargetPanelProps {
  kind: TargetKind;
  /** What the target is called when it is saved: a firm's name, an award's PIID. */
  label: string;
  target: Target | null;
  onSave(request: SaveTargetRequest): void;
  onRemove(): void;
  /** While a save or remove is in flight. */
  saving?: boolean;
  error?: string | null;
}

interface TargetForm {
  stage: TargetStage;
  notes: string;
  contact: string;
  /** `YYYY-MM-DDTHH:mm`, UTC — the input's own spelling. */
  reminder: string;
}

const formOf = (kind: TargetKind, target: Target | null): TargetForm => ({
  stage: target?.stage ?? TARGET_STAGES[kind][0],
  notes: target?.notes ?? '',
  contact: target?.contact ?? '',
  reminder: toReminderInput(target?.reminderAt ?? null),
});

/** What the request carries: every field, so a cleared reminder is written as none. */
export const requestOf = (label: string, form: TargetForm): SaveTargetRequest => ({
  label,
  stage: form.stage,
  notes: form.notes,
  contact: form.contact,
  reminderAt: fromReminderInput(form.reminder),
});

/**
 * A firm's or an award's place in what the company pursues: its stage —
 * each kind has its own — who to reach, a reminder and notes, saved as one
 * row and removed as one. The same panel tracks a thing from its own page
 * and edits it under its row in the pipeline.
 */
export function TargetPanel({
  kind,
  label,
  target,
  onSave,
  onRemove,
  saving = false,
  error = null,
}: TargetPanelProps) {
  const [form, setForm] = useState<TargetForm>(() => formOf(kind, target));
  const noun = TARGET_KIND_LABEL[kind].toLowerCase();
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={3}>Tracking</Heading>
        {target ? (
          <>
            <Badge tone={TARGET_STAGE_TONE[target.stage]}>{target.stage}</Badge>
            <Text as="span" tone="muted" size="sm">
              in this stage since {day(target.stageChangedAt)}
            </Text>
          </>
        ) : (
          <Text as="span" tone="muted" size="sm">
            not tracked
          </Text>
        )}
      </Stack>
      <Text tone="secondary" size="sm">
        {TARGET_KIND_HINT[kind]}
      </Text>
      <Stack direction="row" gap={4} align="end" wrap>
        <SelectField
          label="Stage"
          value={form.stage}
          disabled={saving}
          onChange={(event) => setForm({ ...form, stage: event.target.value as TargetStage })}
        >
          {TARGET_STAGES[kind].map((stage) => (
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
          label="Contact"
          value={form.contact}
          disabled={saving}
          onChange={(event) => setForm({ ...form, contact: event.target.value })}
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
        <Button
          variant="solid"
          size="sm"
          disabled={saving}
          onClick={() => onSave(requestOf(label, form))}
        >
          {saving ? 'Saving…' : target ? 'Save' : `Track this ${noun}`}
        </Button>
        {target && (
          <Button variant="subtle" size="sm" disabled={saving} onClick={onRemove}>
            Stop tracking
          </Button>
        )}
      </Stack>
      {error && <Alert tone="danger">{error}</Alert>}
    </Stack>
  );
}
