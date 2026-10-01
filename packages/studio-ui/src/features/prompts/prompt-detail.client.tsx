'use client';

import { PROMPT_COPY } from '@sysdesign/contracts';
import { Alert, Button, Skeleton, Stack, Surface, Text, Toolbar } from '@sysdesign/design-system';
import { toErrorMessage, useDocumentTitle, useResource } from '@sysdesign/web-kit';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '../../api/client';
import { pageTitle } from '../../app/nav';
import { LoadFailureNotice } from '../../components/load-failure-notice';
import { PromptPane } from './prompt-pane';
import { usePromptCriteria } from './use-prompt-criteria';

export interface PromptDetailProps {
  promptId: string;
}

/** Where a missing prompt's dead end leads. */
const PROMPTS_EXIT = { href: '/prompts', label: 'Back to your prompts' } as const;

/** Why an action is off, beside it: the button names it as its description. */
interface DisabledReason {
  id: string;
  text: string;
}

export function PromptDetail({ promptId }: PromptDetailProps) {
  const router = useRouter();
  const loaded = useResource((signal) => api.getPrompt(promptId, { signal }), [promptId]);
  // A prompt from an earlier id is not this page's prompt.
  const prompt = loaded.data?.id === promptId ? loaded.data : null;
  const [busy, setBusy] = useState<'start' | 'archive' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const criteria = usePromptCriteria(prompt);
  useDocumentTitle(prompt ? pageTitle(prompt.title) : null);

  const handleStart = async () => {
    setBusy('start');
    setError(null);
    try {
      const session = await api.createSession({ promptId });
      router.push(`/practice/${session.id}`);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not start a practice session.'));
      setBusy(null);
    }
  };

  const handleToggleArchive = async () => {
    if (!prompt) return;
    setBusy('archive');
    setError(null);
    try {
      loaded.replace(
        await api.updatePrompt(prompt.id, {
          status: prompt.status === 'active' ? 'archived' : 'active',
        }),
      );
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not update the prompt.'));
    } finally {
      setBusy(null);
    }
  };

  if (prompt === null) {
    return loaded.failure !== null && !loaded.loading ? (
      <LoadFailureNotice
        noun="prompt"
        error={loaded.failure}
        onRetry={loaded.reload}
        exit={PROMPTS_EXIT}
      />
    ) : (
      <Stack gap={4} aria-busy="true">
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="block" height="360px" />
      </Stack>
    );
  }

  // A generated prompt's rubric is its draft's — never re-derived, so it is
  // never offered. Re-deriving is refused once sessions cite these ids, and
  // the server says so on every read; the pane's own button covers the case
  // where there are no criteria at all yet.
  const offersRederive = prompt.source !== 'generated' && criteria.criteria.length > 0;
  const archived = prompt.status === 'archived';
  const startOff: DisabledReason | null = archived
    ? { id: 'start-practice-reason', text: PROMPT_COPY.archived }
    : null;
  const rederiveOff: DisabledReason | null =
    offersRederive && prompt.rubricLocked
      ? { id: 'rederive-criteria-reason', text: PROMPT_COPY.criteriaLocked }
      : null;
  const reasons = [startOff, rederiveOff].filter(
    (reason): reason is DisabledReason => reason !== null,
  );

  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <Toolbar aria-label="Prompt actions">
          <Button
            variant="solid"
            onClick={() => void handleStart()}
            disabled={busy !== null || startOff !== null}
            aria-describedby={startOff?.id}
            data-testid="start-practice"
          >
            {busy === 'start' ? 'Starting…' : 'Start practice'}
          </Button>
          {offersRederive ? (
            <Button
              variant="subtle"
              onClick={criteria.derive}
              disabled={busy !== null || criteria.deriving || rederiveOff !== null}
              aria-describedby={rederiveOff?.id}
              data-testid="rederive-criteria"
            >
              {criteria.deriving ? 'Deriving…' : 'Re-derive criteria'}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => void handleToggleArchive()}
            disabled={busy !== null}
          >
            {archived ? 'Unarchive' : 'Archive'}
          </Button>
        </Toolbar>
        {reasons.map((reason) => (
          <Text key={reason.id} id={reason.id} size="sm" tone="muted" data-testid={reason.id}>
            {reason.text}
          </Text>
        ))}
      </Stack>

      {error !== null ? (
        <Alert tone="danger" data-testid="prompt-action-error">
          {error}
        </Alert>
      ) : null}
      {criteria.error !== null && criteria.criteria.length > 0 ? (
        <Alert tone="danger" data-testid="criteria-error">
          {criteria.error}
        </Alert>
      ) : null}

      <Surface padding={6}>
        <PromptPane
          prompt={prompt}
          titleLevel={1}
          criteria={criteria.criteria}
          deriving={criteria.deriving}
          deriveError={criteria.error}
          onDerive={prompt.rubricLocked ? undefined : criteria.derive}
        />
      </Surface>
    </Stack>
  );
}
