import { describeQuery, type SearchProfile } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';

export interface ProfileSummaryProps {
  profile: SearchProfile;
}

const pct = (value: number): string => `${Math.round(value * 100)}%`;

/** The profile as the scorer reads it — data, read-only; edit the profile file to change it. */
export function ProfileSummary({ profile }: ProfileSummaryProps) {
  const { scoring } = profile;
  return (
    <Stack gap={3}>
      <Heading level={2}>
        Profile · {profile.company} ({profile.id})
      </Heading>
      <Stack direction="row" gap={2} wrap align="center">
        <Text as="span" tone="secondary" size="sm">
          NAICS
        </Text>
        {profile.naics.map((code) => (
          <Badge key={code}>{code}</Badge>
        ))}
      </Stack>
      <Stack direction="row" gap={2} wrap align="center">
        <Text as="span" tone="secondary" size="sm">
          PSC
        </Text>
        {profile.psc.map((code) => (
          <Badge key={code}>{code}</Badge>
        ))}
      </Stack>
      <Text size="sm">
        Interests:{' '}
        {profile.interests
          .map((interest) => `${interest.term} (${pct(interest.weight)})`)
          .join(' · ')}
      </Text>
      <Text size="sm">
        Weights:{' '}
        {Object.entries(scoring.weights)
          .map(([factor, weight]) => `${factor} ${pct(weight)}`)
          .join(' · ')}
      </Text>
      <Text size="sm">
        Set-asides:{' '}
        {Object.entries(scoring.setAside.byCode)
          .map(([code, price]) => `${code} ${pct(price)}`)
          .join(' · ')}{' '}
        · open competition {pct(scoring.setAside.unrestricted)} · any other code is excluded
      </Text>
      <Text size="sm">
        Tiers: high at {scoring.tiers.high}+, medium at {scoring.tiers.medium}+ · deadline bands{' '}
        {scoring.deadline.bands.map((band) => `≤${band.maxDays}d ${pct(band.value)}`).join(', ')},
        beyond {pct(scoring.deadline.beyond)}, none {pct(scoring.deadline.none)}
      </Text>
      <Text size="sm">
        Pull: {profile.pull.slices.length} slice(s) —{' '}
        {profile.pull.slices
          .map((slice) =>
            describeQuery({ ...slice, postedFrom: '', postedTo: '', limit: 1, offset: 0 }),
          )
          .join(', ')}{' '}
        · up to {profile.pull.maxPagesPerSlice} page(s) of {profile.pull.pageSize}
      </Text>
      <Text tone="muted" size="sm">
        Read-only here; the profile lives in the govcon package as data.
      </Text>
    </Stack>
  );
}
