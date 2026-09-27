import type { SourceStatusDto } from '@sysdesign/contracts';
import { Badge, Heading, Meter, Stack, Text, type MeterTone } from '@sysdesign/design-system';

import { AVAILABILITY_TONE } from '../tones';

export interface SourceStatusProps {
  status: SourceStatusDto;
}

/** Usage is the bad end of this scale, so the tone is explicit: the meter's default reads the other way. */
export function budgetTone(spent: number, limit: number): MeterTone {
  if (limit <= 0) return 'danger';
  const used = spent / limit;
  return used >= 0.9 ? 'danger' : used >= 0.6 ? 'warn' : 'success';
}

/** The upstream, read-out only: whether it can be called, and how much of the rolling day's budget is gone. */
export function SourceStatus({ status }: SourceStatusProps) {
  const { availability, budget } = status;
  const availabilityKey = availability.enabled ? 'enabled' : 'disabled';
  return (
    <Stack gap={4}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={2}>Source</Heading>
        <Badge tone={AVAILABILITY_TONE[availabilityKey]}>
          {status.id} {availability.enabled ? 'enabled' : `disabled (${availability.reason})`}
        </Badge>
      </Stack>
      {budget.spent === null ? (
        <Text tone="secondary">
          Budget unknown — the call ledger could not be read. Limit {budget.limit} per{' '}
          {budget.windowHours} h.
        </Text>
      ) : (
        <Meter
          label={`Budget: ${budget.spent} of ${budget.limit} requests used in the last ${budget.windowHours} h`}
          value={budget.limit > 0 ? (budget.spent / budget.limit) * 100 : 100}
          tone={budgetTone(budget.spent, budget.limit)}
        />
      )}
      <Text tone="muted" size="sm">
        {status.cacheTtlHours > 0
          ? `A query pulled inside the last ${status.cacheTtlHours} h is not pulled again.`
          : 'The cache is off: every pull calls the source.'}
      </Text>
    </Stack>
  );
}
