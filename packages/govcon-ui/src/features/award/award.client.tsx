'use client';

import { Spinner, Stack, Surface } from '@sysdesign/design-system';
import { readFailureOf, UNREACHABLE_COPY, useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { FullPageNotice } from '../../components/full-page-notice';
import { ProvenanceLine } from '../spending/provenance-line';
import { TrackTarget } from '../targets/track-target.client';
import {
  AwardFacts,
  AwardHeader,
  AwardMoney,
  AwardNotices,
  AwardSubcontracts,
} from './award-panels';

export interface AwardClientProps {
  /** The source's own id for the award. */
  externalId: string;
}

/**
 * One award's record, read free from USAspending and kept for the day: who
 * holds it and for whom, what is obligated against what it can reach, when
 * it ends and when it would with every option, how it was bought, who works
 * under it, and the open notices from the same buyer and code — and whether
 * the company tracks it, which is the store's to say and costs nothing.
 */
export function AwardClient({ externalId }: AwardClientProps) {
  const award = useResource((signal) => api.getAward(externalId, { signal }), [externalId]);
  if (award.error !== null) {
    // The status decides, never the server's wording: nothing at the address
    // is a dead end, anything else may load on a retry.
    const failure = readFailureOf(award.failure, UNREACHABLE_COPY);
    return failure.kind === 'missing' ? (
      <FullPageNotice
        title="No such award"
        message={`USAspending has no contract or vehicle under ${externalId}.`}
        backHref="/"
      />
    ) : (
      <FullPageNotice
        title="The award could not be loaded"
        message={failure.message}
        onRetry={award.reload}
        backHref="/"
      />
    );
  }
  if (award.data === null) return <Spinner label="Reading the award" />;
  const data = award.data;
  return (
    <Stack gap={5}>
      <Surface as="section" aria-label="Award">
        <Stack gap={4}>
          <AwardHeader award={data} />
          <AwardMoney award={data} nowMs={Date.now()} />
        </Stack>
      </Surface>
      <TrackTarget kind="award" subject={data.externalId} label={data.piid ?? data.externalId} />
      <Surface as="section" aria-label="How it was bought">
        <AwardFacts award={data} />
      </Surface>
      <Surface as="section" aria-label="Subcontractors">
        <AwardSubcontracts award={data} />
      </Surface>
      <Surface as="section" aria-label="Open notices">
        <AwardNotices notices={data.openNotices} />
      </Surface>
      <ProvenanceLine provenance={data.provenance} />
    </Stack>
  );
}
