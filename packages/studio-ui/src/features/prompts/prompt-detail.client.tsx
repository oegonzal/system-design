'use client';

import type { PromptDto } from '@sysdesign/contracts';
import { Button, Skeleton, Stack, Surface, Text, Toolbar } from '@sysdesign/design-system';
import { ApiError, toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { FullPageNotice } from '../../components/full-page-notice';
import { PromptPane } from './prompt-pane';
import { usePromptCriteria } from './use-prompt-criteria';

export interface PromptDetailProps {
  promptId: string;
}

export function PromptDetail({ promptId }: PromptDetailProps) {
  const router = useRouter();
  const loader = useLatestRequest();

  const [prompt, setPrompt] = useState<PromptDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'start' | 'archive' | null>(null);
  const criteria = usePromptCriteria(prompt);

  useEffect(() => {
    const { id, signal } = loader.begin();
    void (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const loaded = await api.getPrompt(promptId, { signal });
        if (!loader.isCurrent(id)) return;
        setPrompt(loaded);
        setLoading(false);
      } catch (caught) {
        if (loader.isStale(id, caught)) return;
        if (caught instanceof ApiError && caught.status === 404) setNotFound(true);
        else setError(toErrorMessage(caught, 'Could not load the prompt.'));
        setLoading(false);
      }
    })();
  }, [promptId]);

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
      const updated = await api.updatePrompt(prompt.id, {
        status: prompt.status === 'active' ? 'archived' : 'active',
      });
      setPrompt(updated);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not update the prompt.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Stack gap={4} aria-busy="true">
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="block" height="360px" />
      </Stack>
    );
  }

  if (notFound || !prompt) {
    return (
      <FullPageNotice
        title="Prompt not found"
        message={
          notFound
            ? 'This prompt does not exist — it may have been deleted.'
            : (error ?? 'Something went wrong loading this prompt.')
        }
        backHref="/"
      />
    );
  }

  return (
    <Stack gap={5}>
      <Toolbar aria-label="Prompt actions">
        <Button
          variant="solid"
          onClick={() => void handleStart()}
          disabled={busy !== null}
          data-testid="start-practice"
        >
          {busy === 'start' ? 'Starting…' : 'Start practice'}
        </Button>
        {/* Re-deriving is refused once sessions cite these ids; the pane's own
            button covers the case where there are no criteria at all yet. */}
        {criteria.criteria.length > 0 ? (
          <Button
            variant="subtle"
            onClick={criteria.derive}
            disabled={busy !== null || criteria.deriving}
            data-testid="rederive-criteria"
          >
            {criteria.deriving ? 'Deriving…' : 'Re-derive criteria'}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void handleToggleArchive()} disabled={busy !== null}>
          {prompt.status === 'active' ? 'Archive' : 'Unarchive'}
        </Button>
      </Toolbar>

      {error !== null ? <Text tone="secondary">{error}</Text> : null}
      {criteria.error !== null && criteria.criteria.length > 0 ? (
        <Text tone="secondary" data-testid="criteria-error">
          {criteria.error}
        </Text>
      ) : null}

      <Surface padding={6}>
        <PromptPane
          prompt={prompt}
          criteria={criteria.criteria}
          deriving={criteria.deriving}
          deriveError={criteria.error}
          onDerive={criteria.derive}
        />
      </Surface>
    </Stack>
  );
}
