'use client';

import {
  STORY_SECTION_BOUND,
  STORY_TITLE_BOUND,
  type ExperienceProfileDto,
  type PromptDto,
  type SaveStarStoryRequest,
  type StarStoryDto,
} from '@sysdesign/contracts';
import {
  Alert,
  Button,
  SelectField,
  Stack,
  Text,
  TextAreaField,
  TextField,
} from '@sysdesign/design-system';
import { useEffect, useId, useState } from 'react';

import { checkStory, parseTags, type StoryCheck, type StoryField } from './story-rule';

export interface StoryFormProps {
  /**
   * Existing story when editing; omit for a blank create form. A container
   * hands over a new one when a save lands — the story as stored — and the
   * form starts again from it, in place.
   */
  initial?: StarStoryDto;
  /** Options for the optional prompt/experience links. */
  prompts?: PromptDto[];
  experiences?: ExperienceProfileDto[];
  saving?: boolean;
  /** Why the last save failed, shown beside Save; null when it did not. */
  error?: string | null;
  /** True once the story on screen is the one just saved — "Saved" shows until the next edit. */
  saved?: boolean;
  onSave: (payload: SaveStarStoryRequest) => void;
  onDelete?: () => void;
  /** Told whenever the form starts or stops holding edits that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** What leaving a story with unsaved edits asks first. */
export const LEAVE_UNSAVED_STORY =
  'Leave this page? Your changes to this story have not been saved.';

/** Stable empty defaults — an inline `[]` default prop is a fresh identity per render. */
const NO_PROMPTS: PromptDto[] = [];
const NO_EXPERIENCES: ExperienceProfileDto[] = [];

interface StoryValues {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string;
  promptId: string;
  experienceId: string;
}

/** A story's content, as a stored story or a save request carries it. */
type StoryContent = Pick<
  SaveStarStoryRequest,
  'title' | 'situation' | 'task' | 'action' | 'result'
> & {
  tags: readonly string[];
  promptId?: string | null;
  experienceId?: string | null;
};

const valuesOf = (story?: StoryContent): StoryValues => ({
  title: story?.title ?? '',
  situation: story?.situation ?? '',
  task: story?.task ?? '',
  action: story?.action ?? '',
  result: story?.result ?? '',
  tags: story?.tags.join(', ') ?? '',
  promptId: story?.promptId ?? '',
  experienceId: story?.experienceId ?? '',
});

/** The four STAR sections, in the order a story is told. */
const SECTIONS = [
  { field: 'situation', label: 'Situation', placeholder: 'Where were you, and what was at stake?' },
  { field: 'task', label: 'Task', placeholder: 'What were you responsible for?' },
  { field: 'action', label: 'Action', placeholder: 'What did you actually do?' },
  { field: 'result', label: 'Result', placeholder: 'What changed, in numbers where possible?' },
] as const satisfies readonly { field: StoryField; label: string; placeholder: string }[];

/** The request a set of values saves as — the save rule trims; the form sends what was typed. */
const payloadOf = (values: StoryValues): SaveStarStoryRequest => ({
  title: values.title,
  situation: values.situation,
  task: values.task,
  action: values.action,
  result: values.result,
  tags: parseTags(values.tags),
  ...(values.promptId ? { promptId: values.promptId } : {}),
  ...(values.experienceId ? { experienceId: values.experienceId } : {}),
});

/**
 * What a save of these values would store, as values: the save rule's own
 * reading of them — trimmed — where it accepts them, and what was typed
 * while it refuses them. "Unsaved" is a difference between two of these,
 * never between two typings: a trailing space is not an edit.
 */
const storedAs = (payload: SaveStarStoryRequest, check: StoryCheck): StoryValues =>
  valuesOf(check.accepted ?? payload);

/** What a save of a story as it stands would store — "unsaved" is measured from here. */
const storedOf = (story?: StoryContent): StoryValues => {
  const payload = payloadOf(valuesOf(story));
  return storedAs(payload, checkStory(payload));
};

const STORY_VALUE_KEYS = Object.keys(valuesOf()) as (keyof StoryValues)[];

/**
 * The STAR editor. Deliberately free of `next/navigation` and API calls —
 * containers own persistence, routing and the leave guard (told through
 * `onDirtyChange`), which keeps this form pure enough for Storybook and unit
 * tests.
 *
 * Validation is the contract's save rule, read field by field: a field says
 * why it is refused beside itself — once it was visited, or as soon as it
 * holds something the rule refuses (a tag too long, too many tags) — and a
 * disabled Save says what is still missing. A failed save and a finished
 * one are told beside Save, where the author is looking, and the focus
 * stays where the author left it. Unsaved is the same rule's judgement: the
 * form holds edits only while a save would store something other than what
 * it started from — `initial`, which a container replaces with the story a
 * save stored.
 */
export function StoryForm({
  initial,
  prompts = NO_PROMPTS,
  experiences = NO_EXPERIENCES,
  saving = false,
  error = null,
  saved = false,
  onSave,
  onDelete,
  onDirtyChange,
}: StoryFormProps) {
  const reasonId = useId();
  const [values, setValues] = useState<StoryValues>(() => valuesOf(initial));
  const [visited, setVisited] = useState<ReadonlySet<StoryField>>(() => new Set());
  const [storedInitially, setStoredInitially] = useState(() => storedOf(initial));
  // A new story to start from — the one a save just stored — is a fresh
  // start: the fields show what was stored, trimmed, and edits start from
  // there. In place, never by remounting the form, so the control the author
  // saved from keeps the focus.
  const [startedFrom, setStartedFrom] = useState(initial);
  if (startedFrom !== initial) {
    setStartedFrom(initial);
    setValues(valuesOf(initial));
    setVisited(new Set());
    setStoredInitially(storedOf(initial));
  }

  const payload = payloadOf(values);
  const check = checkStory(payload);
  const valid = check.accepted !== null;
  const stored = storedAs(payload, check);
  const dirty = STORY_VALUE_KEYS.some((key) => stored[key] !== storedInitially[key]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const set = (key: keyof StoryValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const visit = (field: StoryField) => () =>
    setVisited((current) => (current.has(field) ? current : new Set(current).add(field)));
  /** A field's refusal, once the author has been there or has typed something it refuses. */
  const errorFor = (field: StoryField): string | null => {
    const refusal = check.errors[field] ?? null;
    return refusal !== null && (visited.has(field) || values[field].trim().length > 0)
      ? refusal
      : null;
  };

  const handleSave = () => {
    if (saving) return;
    if (check.accepted === null) {
      setVisited(new Set(Object.keys(check.errors) as StoryField[]));
      return;
    }
    // What the rule accepted — trimmed — is what is sent.
    onSave(check.accepted);
  };

  const reason = valid
    ? null
    : check.missing.length > 0
      ? 'Title and all four STAR sections are required.'
      : 'Fix the marked fields to save.';

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
        value={values.title}
        maxLength={STORY_TITLE_BOUND.ceiling}
        target={STORY_TITLE_BOUND.target}
        onChange={(event) => set('title')(event.target.value)}
        onBlur={visit('title')}
        error={errorFor('title')}
        placeholder="The outage we turned into a design win"
        required
      />
      {SECTIONS.map((section) => (
        <TextAreaField
          key={section.field}
          label={section.label}
          value={values[section.field]}
          maxLength={STORY_SECTION_BOUND.ceiling}
          target={STORY_SECTION_BOUND.target}
          onChange={(event) => set(section.field)(event.target.value)}
          onBlur={visit(section.field)}
          error={errorFor(section.field)}
          placeholder={section.placeholder}
          required
        />
      ))}
      <TextField
        label="Tags (comma separated)"
        value={values.tags}
        onChange={(event) => set('tags')(event.target.value)}
        onBlur={visit('tags')}
        error={errorFor('tags')}
        placeholder="postgres, caching, incident"
      />
      <SelectField
        label="Linked prompt (optional)"
        value={values.promptId}
        onChange={(event) => set('promptId')(event.target.value)}
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
        value={values.experienceId}
        onChange={(event) => set('experienceId')(event.target.value)}
      >
        <option value="">No linked experience</option>
        {experiences.map((experience) => (
          <option key={experience.id} value={experience.id}>
            {experience.companyLabel} — {experience.title}
          </option>
        ))}
      </SelectField>

      <Stack gap={3}>
        {error !== null ? (
          <Alert tone="danger" data-testid="story-save-error">
            {error}
          </Alert>
        ) : null}
        <Stack direction="row" gap={3} align="center" wrap>
          {/* Busy, not inapplicable, while a save is on its way: it stays
              focusable, so the author's place survives the save. */}
          <Button
            type="submit"
            variant="solid"
            disabled={!valid}
            aria-disabled={saving || undefined}
            aria-describedby={reason !== null ? reasonId : undefined}
            data-testid="save-story"
          >
            {saving ? 'Saving…' : 'Save story'}
          </Button>
          {onDelete ? (
            <Button variant="ghost" onClick={onDelete} disabled={saving} data-testid="delete-story">
              Delete story
            </Button>
          ) : null}
          {saved && !dirty && !saving ? (
            <Text as="span" size="sm" tone="secondary" data-testid="story-saved">
              Saved
            </Text>
          ) : null}
        </Stack>
        {reason !== null ? (
          <Text id={reasonId} size="sm" tone="muted" data-testid="save-story-reason">
            {reason}
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}
