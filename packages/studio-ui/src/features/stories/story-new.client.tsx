'use client';

import type { ExperienceProfileDto, PromptDto, SaveStarStoryRequest } from '@sysdesign/contracts';
import { Heading, Stack, Surface, Text } from '@sysdesign/design-system';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';
import { StoryForm } from './story-form';

export function StoryNew() {
  const router = useRouter();

  const [prompts, setPrompts] = useState<PromptDto[]>([]);
  const [experiences, setExperiences] = useState<ExperienceProfileDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Link options are a convenience — the form works without them.
    void Promise.all([api.listPrompts({ limit: 50 }), api.listExperiences()])
      .then(([promptList, experienceList]) => {
        setPrompts(promptList.data);
        setExperiences(experienceList.data);
      })
      .catch(() => undefined);
  }, []);

  const handleSave = async (payload: SaveStarStoryRequest) => {
    setSaving(true);
    setError(null);
    try {
      const story = await api.createStory(payload);
      router.push(`/stories/${story.id}`);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not save the story.'));
      setSaving(false);
    }
  };

  return (
    <Stack gap={5}>
      <Heading level={1}>New STAR story</Heading>
      {error !== null ? <Text tone="secondary">{error}</Text> : null}
      <Surface padding={6}>
        <StoryForm
          prompts={prompts}
          experiences={experiences}
          saving={saving}
          onSave={(payload) => void handleSave(payload)}
        />
      </Surface>
    </Stack>
  );
}
