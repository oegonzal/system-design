'use client';

import {
  STORY_MAX_TAGS,
  STORY_SECTION_MAX_LENGTH,
  STORY_TITLE_MAX_LENGTH,
  type ExperienceProfileDto,
  type PromptDto,
  type SaveStarStoryRequest,
  type StarStoryDto,
} from '@sysdesign/contracts';
import {
  Button,
  SelectField,
  Stack,
  Text,
  TextAreaField,
  TextField,
} from '@sysdesign/design-system';
import { useState } from 'react';

export interface StoryFormProps {
  /** Existing story when editing; omit for a blank create form. */
  initial?: StarStoryDto;
  /** Options for the optional prompt/experience links. */
  prompts?: PromptDto[];
  experiences?: ExperienceProfileDto[];
  saving?: boolean;
  onSave: (payload: SaveStarStoryRequest) => void;
  onDelete?: () => void;
}

/** Stable empty defaults — an inline `[]` default prop is a fresh identity per render. */
const NO_PROMPTS: PromptDto[] = [];
const NO_EXPERIENCES: ExperienceProfileDto[] = [];

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ].slice(0, STORY_MAX_TAGS);
}

/**
 * The STAR editor. Deliberately free of `next/navigation` and API calls —
 * containers own persistence and routing, which keeps this form pure enough
 * for Storybook and unit tests.
 */
export function StoryForm({
  initial,
  prompts = NO_PROMPTS,
  experiences = NO_EXPERIENCES,
  saving = false,
  onSave,
  onDelete,
}: StoryFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [situation, setSituation] = useState(initial?.situation ?? '');
  const [task, setTask] = useState(initial?.task ?? '');
  const [action, setAction] = useState(initial?.action ?? '');
  const [result, setResult] = useState(initial?.result ?? '');
  const [tagsRaw, setTagsRaw] = useState(initial?.tags.join(', ') ?? '');
  const [promptId, setPromptId] = useState(initial?.promptId ?? '');
  const [experienceId, setExperienceId] = useState(initial?.experienceId ?? '');

  const complete = [title, situation, task, action, result].every(
    (value) => value.trim().length > 0,
  );

  const handleSave = () => {
    if (!complete || saving) return;
    onSave({
      title: title.trim(),
      situation: situation.trim(),
      task: task.trim(),
      action: action.trim(),
      result: result.trim(),
      tags: parseTags(tagsRaw),
      ...(promptId ? { promptId } : {}),
      ...(experienceId ? { experienceId } : {}),
    });
  };

  return (
    <Stack
      as="form"
      gap={5}
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
      data-testid="story-form"
    >
      <TextField
        label="Title"
        value={title}
        maxLength={STORY_TITLE_MAX_LENGTH}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="The outage we turned into a design win"
        required
      />
      <TextAreaField
        label="Situation"
        value={situation}
        maxLength={STORY_SECTION_MAX_LENGTH}
        onChange={(event) => setSituation(event.target.value)}
        placeholder="Where were you, and what was at stake?"
        required
      />
      <TextAreaField
        label="Task"
        value={task}
        maxLength={STORY_SECTION_MAX_LENGTH}
        onChange={(event) => setTask(event.target.value)}
        placeholder="What were you responsible for?"
        required
      />
      <TextAreaField
        label="Action"
        value={action}
        maxLength={STORY_SECTION_MAX_LENGTH}
        onChange={(event) => setAction(event.target.value)}
        placeholder="What did you actually do?"
        required
      />
      <TextAreaField
        label="Result"
        value={result}
        maxLength={STORY_SECTION_MAX_LENGTH}
        onChange={(event) => setResult(event.target.value)}
        placeholder="What changed, in numbers where possible?"
        required
      />
      <TextField
        label="Tags (comma separated)"
        value={tagsRaw}
        onChange={(event) => setTagsRaw(event.target.value)}
        placeholder="postgres, caching, incident"
      />
      <SelectField
        label="Linked prompt (optional)"
        value={promptId}
        onChange={(event) => setPromptId(event.target.value)}
      >
        <option value="">No linked prompt</option>
        {prompts.map((prompt) => (
          <option key={prompt.id} value={prompt.id}>
            {prompt.title}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Linked experience (optional)"
        value={experienceId}
        onChange={(event) => setExperienceId(event.target.value)}
      >
        <option value="">No linked experience</option>
        {experiences.map((experience) => (
          <option key={experience.id} value={experience.id}>
            {experience.companyLabel} — {experience.title}
          </option>
        ))}
      </SelectField>

      {!complete ? (
        <Text size="sm" tone="muted">
          Title and all four STAR sections are required.
        </Text>
      ) : null}

      <Stack direction="row" gap={3}>
        <Button
          type="submit"
          variant="solid"
          disabled={!complete || saving}
          data-testid="save-story"
        >
          {saving ? 'Saving…' : 'Save story'}
        </Button>
        {onDelete ? (
          <Button variant="ghost" onClick={onDelete} disabled={saving} data-testid="delete-story">
            Delete story
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
