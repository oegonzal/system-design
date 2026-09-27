import type { SearchProfile } from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

export interface PullForm {
  profileId: string;
  days: number;
}

export const MIN_PULL_DAYS = 1;
export const MAX_PULL_DAYS = 366;

export const clampDays = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_PULL_DAYS, Math.max(MIN_PULL_DAYS, Math.round(value)))
    : MIN_PULL_DAYS;

export interface PullControlsProps {
  profiles: readonly SearchProfile[];
  value: PullForm;
  onChange(next: PullForm): void;
  onPull(): void;
  /** While a pull is in flight. */
  pulling?: boolean;
  /** Why the source cannot be called, when it cannot; the button stays off. */
  sourceDisabledReason?: string | null;
}

/** A profile, a window in days, and the one button that spends the budget. */
export function PullControls({
  profiles,
  value,
  onChange,
  onPull,
  pulling = false,
  sourceDisabledReason = null,
}: PullControlsProps) {
  const disabled = pulling || sourceDisabledReason !== null;
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={4} align="end" wrap>
        <SelectField
          label="Profile"
          value={value.profileId}
          disabled={pulling}
          onChange={(event) => onChange({ ...value, profileId: event.target.value })}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.company} ({profile.id})
            </option>
          ))}
        </SelectField>
        <TextField
          label="Posted in the last N days"
          type="number"
          min={MIN_PULL_DAYS}
          max={MAX_PULL_DAYS}
          value={value.days}
          disabled={pulling}
          onChange={(event) => onChange({ ...value, days: clampDays(event.target.valueAsNumber) })}
        />
        <Button
          variant="solid"
          size="md"
          onClick={onPull}
          disabled={disabled || value.profileId === ''}
        >
          {pulling ? 'Pulling…' : 'Pull'}
        </Button>
      </Stack>
      {sourceDisabledReason !== null && (
        <Text tone="secondary" size="sm">
          The source cannot be called: {sourceDisabledReason}.
        </Text>
      )}
    </Stack>
  );
}
