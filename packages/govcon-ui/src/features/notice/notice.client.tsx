'use client';

import type { Entity, SaveBidRequest } from '@sysdesign/contracts';
import { Alert, LiveRegion, Spinner, Stack, Surface } from '@sysdesign/design-system';
import { readFailureOf, UNREACHABLE_COPY, useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { FullPageNotice } from '../../components/full-page-notice';
import { useProfile } from '../../providers/profile-context';
import { AttachmentList } from './attachment-list';
import { AwardsPanel } from './awards-panel';
import { BidPanel } from './bid-panel';
import { DescriptionPanel } from './description-panel';
import { IncumbentsLens } from './incumbents.client';
import { NoticeFacts } from './notice-facts';
import { NoticeHeader } from './notice-header';
import { ScoreTrace } from './score-trace';

export interface NoticeClientProps {
  noticeId: string;
}

/**
 * One notice in full. The notice is one resource read for the active
 * profile; every write — the description, the bid, an awardee lookup — is
 * one action that reads it again when it lands. A request that spends the
 * budget is a click that says so, and so is the one that asks the award
 * source who holds the work.
 */
export function NoticeClient({ noticeId }: NoticeClientProps) {
  const { active, loading: profileLoading } = useProfile();
  const profileId = active?.id;
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [entities, setEntities] = useState<Record<string, Entity>>({});
  const [lookingUp, setLookingUp] = useState<string | null>(null);

  const notice = useResource(
    (signal) =>
      profileLoading ? Promise.resolve(null) : api.getNotice(noticeId, profileId, { signal }),
    [noticeId, profileId, profileLoading],
  );

  const fetchDescription = useAction(async () => {
    setProblem(null);
    const outcome = await api.fetchDescription(noticeId);
    if (outcome.status === 'ok') {
      setMessage('Description fetched and stored.');
      notice.reload();
    } else if (outcome.status === 'budget-exhausted') {
      setProblem(
        `The budget is spent: ${outcome.spent} of ${outcome.budget} requests used in the last 24 h.`,
      );
    } else {
      setProblem(`Could not fetch the description: ${outcome.message}`);
    }
    return outcome;
  });

  const saveBid = useAction(async (request: SaveBidRequest) => {
    const bid = await api.saveBid(noticeId, request);
    setMessage(`Bid saved: ${bid.stage}.`);
    notice.reload();
    return bid;
  });

  const removeBid = useAction(async () => {
    await api.removeBid(noticeId);
    setMessage('Removed from the pipeline.');
    notice.reload();
  });

  const lookup = useAction(async (uei: string) => {
    setLookingUp(uei);
    try {
      const result = await api.lookupEntities({ ueis: [uei] });
      const found = result.entities.find((entity) => entity.uei === uei);
      if (found) {
        setEntities((current) => ({ ...current, [uei]: found }));
        setMessage(`Looked up ${found.legalName}.`);
      } else {
        setMessage(`SAM.gov knows no registrant ${uei}.`);
      }
      return result;
    } finally {
      setLookingUp(null);
    }
  });

  if (notice.error !== null) {
    // The status decides, never the server's wording: nothing at the address
    // is a dead end, anything else may load on a retry.
    const failure = readFailureOf(notice.failure, UNREACHABLE_COPY);
    return failure.kind === 'missing' ? (
      <FullPageNotice
        title="No such notice"
        message={`Nothing is stored under ${noticeId}. Pull first, or check the id.`}
        backHref="/"
      />
    ) : (
      <FullPageNotice
        title="The notice could not be loaded"
        message={failure.message}
        onRetry={notice.reload}
        backHref="/"
      />
    );
  }
  if (notice.data === null) return <Spinner label="Loading the notice" />;

  const data = notice.data;
  return (
    <Stack gap={5}>
      <Surface as="section" aria-label="Notice">
        <Stack gap={4}>
          <NoticeHeader opportunity={data.opportunity} />
          <NoticeFacts opportunity={data.opportunity} />
          <AttachmentList attachments={data.attachments} />
        </Stack>
      </Surface>
      <Surface as="section" aria-label="Score">
        <ScoreTrace lead={data} />
      </Surface>
      <Surface as="section" aria-label="Description">
        <DescriptionPanel
          description={data.description}
          onFetch={() => void fetchDescription.run()}
          fetching={fetchDescription.pending}
          problem={problem ?? fetchDescription.error}
        />
      </Surface>
      <Surface as="section" aria-label="Bid">
        <BidPanel
          key={data.bid?.updatedAt ?? 'none'}
          bid={data.bid}
          onSave={(request) => void saveBid.run(request)}
          onRemove={() => void removeBid.run()}
          saving={saveBid.pending || removeBid.pending}
          error={saveBid.error ?? removeBid.error}
        />
      </Surface>
      <Surface as="section" aria-label="Awards">
        <AwardsPanel
          awards={data.awards}
          entities={entities}
          onLookup={(uei) => void lookup.run(uei)}
          lookingUp={lookingUp}
          lookupError={lookup.error}
        />
      </Surface>
      <Surface as="section" aria-label="Who holds this work">
        <IncumbentsLens noticeId={noticeId} noticePsc={data.opportunity.classificationCode} />
      </Surface>
      {notice.loading && <Alert tone="info">Refreshing…</Alert>}
      <LiveRegion message={message} />
    </Stack>
  );
}
