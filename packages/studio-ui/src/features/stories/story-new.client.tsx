'use client';

import type { SaveStarStoryRequest } from '@sysdesign/contracts';
import { Heading, Stack, Surface } from '@sysdesign/design-system';
import { toErrorMessage, useLeaveGuard } from '@sysdesign/web-kit';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '../../api/client';
import { LEAVE_UNSAVED_STORY, StoryForm } from './story-form';
import { useStoryLinkOptions } from './use-story-link-options';

export function StoryNew() {
  const router = useRouter();
  const { prompts, experiences } = useStoryLinkOptions();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // A save in flight is on its way, and navigates away itself.
  useLeaveGuard(dirty && !saving, LEAVE_UNSAVED_STORY);

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
      <Surface padding={6}>
        <StoryForm
          prompts={prompts}
          experiences={experiences}
          saving={saving}
          error={error}
          onSave={(payload) => void handleSave(payload)}
          onDirtyChange={setDirty}
        />
      </Surface>
    </Stack>
  );
}
