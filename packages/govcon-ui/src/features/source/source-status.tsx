import type { SourceStatus as SourceStatusData } from '@sysdesign/contracts';
import { Badge, Heading, Meter, Stack, Text, type MeterTone } from '@sysdesign/design-system';

import { AVAILABILITY_TONE } from '../tones';

export interface SourceStatusProps {
  status: SourceStatusData;
}

/** Usage is the bad end of this scale, so the tone is explicit: the meter's default reads the other way. */
export function budgetTone(spent: number, limit: number): MeterTone {
  if (limit <= 0) return 'danger';
  const used = spent / limit;
  return used >= 0.9 ? 'danger' : used >= 0.6 ? 'warn' : 'success';
}

/** The upstreams, read-out only: each source and whether it can be called, each bucket as a meter over the rolling day. */
export function SourceStatus({ status }: SourceStatusProps) {
  return (
    <Stack gap={4}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={2}>Sources</Heading>
        {status.sources.map((source) => (
          <Badge
            key={source.id}
            tone={AVAILABILITY_TONE[source.availability.enabled ? 'enabled' : 'disabled']}
          >
            {source.id}{' '}
            {source.availability.enabled ? 'enabled' : `disabled (${source.availability.reason})`}
            {source.bucket === null ? ' · free' : ''}
          </Badge>
        ))}
      </Stack>
      {status.buckets.map((bucket) =>
        bucket.spent === null ? (
          <Text key={bucket.id} tone="secondary">
            {bucket.id}: budget unknown — the call ledger could not be read. Limit {bucket.limit}{' '}
            per {bucket.windowHours} h.
          </Text>
        ) : (
          <Meter
            key={bucket.id}
            label={`${bucket.id}: ${bucket.spent} of ${bucket.limit} requests used in the last ${bucket.windowHours} h`}
            value={bucket.limit > 0 ? (bucket.spent / bucket.limit) * 100 : 100}
            tone={budgetTone(bucket.spent, bucket.limit)}
          />
        ),
      )}
      <Text tone="muted" size="sm">
        {status.cacheTtlHours > 0
          ? `A query pulled inside the last ${status.cacheTtlHours} h is not pulled again.`
          : 'The cache is off: every pull calls the source.'}
      </Text>
    </Stack>
  );
}
