'use client';

import type { SaveStarStoryRequest } from '@sysdesign/contracts';
import { Heading, LiveRegion, Skeleton, Stack, Surface } from '@sysdesign/design-system';
import { toErrorMessage, useDocumentTitle, useLeaveGuard, useResource } from '@sysdesign/web-kit';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '../../api/client';
import { pageTitle } from '../../app/nav';
import { LoadFailureNotice } from '../../components/load-failure-notice';
import { LEAVE_UNSAVED_STORY, StoryForm } from './story-form';
import { useStoryLinkOptions } from './use-story-link-options';

export interface StoryDetailProps {
  storyId: string;
}

/** Where a missing story's dead end leads. */
const STORIES_EXIT = { href: '/stories', label: 'Back to your stories' } as const;

export function StoryDetail({ storyId }: StoryDetailProps) {
  const router = useRouter();
  const loaded = useResource((signal) => api.getStory(storyId, { signal }), [storyId]);
  // A story from an earlier id is not this page's story.
  const story = loaded.data?.id === storyId ? loaded.data : null;
  const { prompts, experiences } = useStoryLinkOptions();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /** How many saves have landed — what makes each one a fresh form. */
  const [savesLanded, setSavesLanded] = useState(0);
  useDocumentTitle(story ? pageTitle(story.title) : null);
  useLeaveGuard(dirty && !saving, LEAVE_UNSAVED_STORY);

  const handleSave = async (payload: SaveStarStoryRequest) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    // Emptied first, so a second save that reads the same is still announced.
    setAnnouncement('');
    try {
      loaded.replace(await api.updateStory(storyId, payload));
      setSavesLanded((landed) => landed + 1);
      setSaved(true);
      setAnnouncement('Story saved.');
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not save the story.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this story? This cannot be undone.')) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteStory(storyId);
      router.push('/stories');
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not delete the story.'));
      setSaving(false);
    }
  };

  if (story === null) {
    return loaded.failure !== null && !loaded.loading ? (
      <LoadFailureNotice
        noun="STAR story"
        error={loaded.failure}
        onRetry={loaded.reload}
        exit={STORIES_EXIT}
      />
    ) : (
      <Stack gap={4} aria-busy="true">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="block" height="420px" />
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <Heading level={1}>{story.title}</Heading>
      <LiveRegion message={announcement} />
      <Surface padding={6}>
        {/*
          Every save that lands is a fresh form: its fields show what was
          stored — trimmed — and its edits start from there. The story's own
          `updatedAt` cannot key it: a save that stores nothing new leaves
          it standing.
        */}
        <StoryForm
          key={savesLanded}
          initial={story}
          prompts={prompts}
          experiences={experiences}
          saving={saving}
          saved={saved}
          error={error}
          onSave={(payload) => void handleSave(payload)}
          onDelete={() => void handleDelete()}
          onDirtyChange={setDirty}
        />
      </Surface>
    </Stack>
  );
}
