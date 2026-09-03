'use client';

import type {
  ExperienceProfileDto,
  PromptDto,
  SaveStarStoryRequest,
  StarStoryDto,
} from '@sysdesign/contracts';
import { Heading, LiveRegion, Skeleton, Stack, Surface, Text } from '@sysdesign/design-system';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api, ApiError, toErrorMessage } from '../../api/client';
import { FullPageNotice } from '../../components/full-page-notice';
import { useLatestRequest } from '../../hooks/use-latest-request';
import { StoryForm } from './story-form';

export interface StoryDetailProps {
  storyId: string;
}

export function StoryDetail({ storyId }: StoryDetailProps) {
  const router = useRouter();
  const loader = useLatestRequest();

  const [story, setStory] = useState<StarStoryDto | null>(null);
  const [prompts, setPrompts] = useState<PromptDto[]>([]);
  const [experiences, setExperiences] = useState<ExperienceProfileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const { id, signal } = loader.begin();
    void (async () => {
      try {
        const loaded = await api.getStory(storyId, { signal });
        if (!loader.isCurrent(id)) return;
        setStory(loaded);
        setLoading(false);
      } catch (caught) {
        if (loader.isStale(id, caught)) return;
        if (caught instanceof ApiError && caught.status === 404) setNotFound(true);
        else setError(toErrorMessage(caught, 'Could not load the story.'));
        setLoading(false);
      }
    })();

    void Promise.all([api.listPrompts({ limit: 50 }), api.listExperiences()])
      .then(([promptList, experienceList]) => {
        setPrompts(promptList.data);
        setExperiences(experienceList.data);
      })
      .catch(() => undefined);
  }, [storyId]);

  const handleSave = async (payload: SaveStarStoryRequest) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateStory(storyId, payload);
      setStory(updated);
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
    try {
      await api.deleteStory(storyId);
      router.push('/stories');
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not delete the story.'));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Stack gap={4} aria-busy="true">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="block" height="420px" />
      </Stack>
    );
  }

  if (notFound || !story) {
    return (
      <FullPageNotice
        title="Story not found"
        message={
          notFound
            ? 'This story does not exist — it may have been deleted.'
            : (error ?? 'Something went wrong loading this story.')
        }
        backHref="/"
      />
    );
  }

  return (
    <Stack gap={5}>
      <Heading level={1}>{story.title}</Heading>
      <LiveRegion message={announcement} />
      {error !== null ? <Text tone="secondary">{error}</Text> : null}
      <Surface padding={6}>
        <StoryForm
          key={story.updatedAt}
          initial={story}
          prompts={prompts}
          experiences={experiences}
          saving={saving}
          onSave={(payload) => void handleSave(payload)}
          onDelete={() => void handleDelete()}
        />
      </Surface>
    </Stack>
  );
}
