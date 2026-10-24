'use client';

import type { IntroductionDto, Target } from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  Button,
  Heading,
  LiveRegion,
  PreformattedText,
  Spinner,
  Stack,
  Surface,
  Text,
} from '@sysdesign/design-system';
import { useAction, usePolledResource, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { DECISION_TONE } from '../tones';

/** How often a draft in progress is asked after; a note takes the loop a minute or two. */
export const INTRODUCTION_POLL_INTERVAL_MS = 3000;

export interface IntroductionDraftProps {
  /** The award the note is about, by the id its record is read by. */
  awardExternalId: string;
}

const TARGET = { kind: 'award' as const };

/** The latest draft the target's log points at, so a page opened later shows the note again. */
const latestDraftOf = (target: Target | null): string | null =>
  [...(target?.activity ?? [])]
    .filter((entry) => entry.kind === 'drafted' && entry.ref !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]?.ref ?? null;

/**
 * An introduction to the award's holder, drafted by the quality loop from the
 * award's record and the profile's offers: one click starts the run, the
 * page asks after it until the note is ready or the run failed, and the note
 * is shown with the judges' decision beside it for the person to copy and
 * send. The service logs the draft on the target; the latest draft reopens
 * from that log.
 */
export function IntroductionDraft({ awardExternalId }: IntroductionDraftProps) {
  const [message, setMessage] = useState('');
  const tracked = useResource(
    async (signal) => ({ target: await api.getTarget(TARGET.kind, awardExternalId, { signal }) }),
    [awardExternalId],
  );
  const target = tracked.data?.target ?? null;
  const [runId, setRunId] = useState<string | null>(null);
  const followed = runId ?? latestDraftOf(target);
  const draft = usePolledResource<IntroductionDto>({
    key: followed,
    fetch: (key, signal) =>
      api.getIntroduction(key, { kind: TARGET.kind, subject: awardExternalId }, { signal }),
    isTerminal: (resource) => resource.status !== 'pending',
    terminalError: (resource) => (resource.status === 'failed' ? resource.reason : null),
    intervalMs: INTRODUCTION_POLL_INTERVAL_MS,
  });
  const start = useAction(async () => {
    const started = await api.startIntroduction({
      kind: TARGET.kind,
      subject: awardExternalId,
      awardExternalId,
    });
    setRunId(started.runId);
    setMessage('Drafting the introduction.');
  });
  const copy = useAction(async () => {
    const note = draft.resource?.note;
    if (!note) return;
    await navigator.clipboard.writeText(`${note.subject}\n\n${note.body}`);
    setMessage('Copied the note.');
  });
  if (tracked.data === null) return null;

  return (
    <Surface as="section" aria-label="Introduction">
      <Stack gap={3}>
        <Heading level={2}>Introduction</Heading>
        {target === null ? (
          <Text tone="muted" size="sm">
            Track this award, then a note to its holder can be drafted here from the award’s record
            and the profile’s offers.
          </Text>
        ) : (
          <Stack direction="row" gap={3} align="center" wrap>
            <Button
              variant="solid"
              size="sm"
              disabled={start.pending || draft.isPolling}
              onClick={() => void start.run()}
            >
              {draft.isPolling
                ? 'Drafting…'
                : draft.resource
                  ? 'Draft again'
                  : 'Draft an introduction'}
            </Button>
            {draft.resource?.decision ? (
              <Badge tone={DECISION_TONE[draft.resource.decision]}>
                {`${draft.resource.decision}${draft.resource.overall === null ? '' : ` · ${Math.round(draft.resource.overall)}`}`}
              </Badge>
            ) : null}
            {draft.resource?.note ? (
              <Button
                variant="subtle"
                size="sm"
                disabled={copy.pending}
                onClick={() => void copy.run()}
              >
                Copy
              </Button>
            ) : null}
          </Stack>
        )}
        {start.error ? <Alert tone="danger">{start.error}</Alert> : null}
        {copy.error ? <Alert tone="danger">{copy.error}</Alert> : null}
        {draft.error ? <Alert tone="danger">{draft.error}</Alert> : null}
        {draft.isPolling ? <Spinner label="The loop is writing the note" /> : null}
        {draft.resource?.note ? (
          <Stack gap={2} aria-label="Drafted note">
            <Text>
              <strong>{draft.resource.note.subject}</strong>
            </Text>
            <PreformattedText label="The note" text={draft.resource.note.body} />
            <Text tone="muted" size="sm">
              Logged on the target as a draft; log the sending yourself when it goes out.
            </Text>
          </Stack>
        ) : null}
      </Stack>
      <LiveRegion message={message} />
    </Surface>
  );
}
