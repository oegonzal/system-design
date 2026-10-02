import { STORY_MAX_TAGS, STORY_TAG_MAX_LENGTH } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeStory } from '../../testing/fixtures';
import { StoryForm } from './story-form';

describe('StoryForm', () => {
  it('disables save until the title and all four STAR sections are filled', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithTheme(<StoryForm onSave={onSave} />);

    const save = screen.getByTestId('save-story') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await user.type(screen.getByLabelText('Title'), 'The replica save');
    await user.type(screen.getByLabelText('Situation'), 'Primary at 95% CPU.');
    await user.type(screen.getByLabelText('Task'), 'Fix the data tier.');
    await user.type(screen.getByLabelText('Action'), 'Added a read replica.');
    expect(save.disabled).toBe(true);

    await user.type(screen.getByLabelText('Result'), 'p99 dropped 60%.');
    expect(save.disabled).toBe(false);
  });

  it('saves a trimmed payload with parsed, deduped tags', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithTheme(<StoryForm onSave={onSave} />);

    await user.type(screen.getByLabelText('Title'), '  The replica save  ');
    await user.type(screen.getByLabelText('Situation'), 'Primary at 95% CPU.');
    await user.type(screen.getByLabelText('Task'), 'Fix the data tier.');
    await user.type(screen.getByLabelText('Action'), 'Added a read replica.');
    await user.type(screen.getByLabelText('Result'), 'p99 dropped 60%.');
    await user.type(
      screen.getByLabelText('Tags (comma separated)'),
      ' postgres, caching , postgres,, ',
    );
    await user.click(screen.getByTestId('save-story'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      title: 'The replica save',
      situation: 'Primary at 95% CPU.',
      task: 'Fix the data tier.',
      action: 'Added a read replica.',
      result: 'p99 dropped 60%.',
      tags: ['postgres', 'caching'],
    });
  });

  it('prefills from an existing story and includes chosen links in the payload', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const story = makeStory();
    renderWithTheme(<StoryForm initial={story} onSave={onSave} />);

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(story.title);

    await user.click(screen.getByTestId('save-story'));

    expect(onSave).toHaveBeenCalledWith({
      title: story.title,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
      tags: story.tags,
    });
  });

  it('[STAR-1] says what a visited, empty section is missing beside it, and why Save is off beside Save', async () => {
    const user = userEvent.setup();
    renderWithTheme(<StoryForm onSave={vi.fn()} />);

    const situation = screen.getByLabelText('Situation');
    // Untouched: nothing is marked yet, but Save says what it waits for.
    expect(situation.getAttribute('aria-invalid')).toBeNull();
    const save = screen.getByTestId('save-story');
    expect(document.getElementById(save.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Title and all four STAR sections are required.',
    );

    await user.click(situation);
    await user.tab();
    expect(situation.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(situation.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Required.');
    // Whitespace is not a section.
    await user.type(situation, '   ');
    expect(situation.getAttribute('aria-invalid')).toBe('true');
    await user.type(situation, 'Primary at 95% CPU.');
    expect(situation.getAttribute('aria-invalid')).toBeNull();
  });

  it('[STAR-1] names a tag that is too long, and counts tags past the limit — sending none of it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithTheme(<StoryForm initial={makeStory({ tags: [] })} onSave={onSave} />);
    const tags = screen.getByLabelText('Tags (comma separated)');
    const save = screen.getByTestId('save-story') as HTMLButtonElement;
    const reason = () =>
      document.getElementById(tags.getAttribute('aria-describedby') ?? '')?.textContent;

    const long = 'x'.repeat(STORY_TAG_MAX_LENGTH + 1);
    await user.type(tags, `postgres, ${long}`);
    expect(reason()).toBe(`“${long}” is longer than ${STORY_TAG_MAX_LENGTH} characters.`);
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId('save-story-reason').textContent).toBe(
      'Fix the marked fields to save.',
    );

    await user.clear(tags);
    const many = Array.from({ length: STORY_MAX_TAGS + 1 }, (_, i) => `t${i}`);
    await user.type(tags, many.join(','));
    expect(reason()).toBe(`At most ${STORY_MAX_TAGS} tags — this has ${STORY_MAX_TAGS + 1}.`);
    expect(save.disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('[STAR-1] tells a failed save beside Save, as an alert, and a finished one until the next edit', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithTheme(
      <StoryForm
        initial={makeStory()}
        onSave={vi.fn()}
        error="A story titled “x” already exists"
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('A story titled “x” already exists');
    // Beside the action it is about.
    expect(alert.parentElement?.contains(screen.getByTestId('save-story'))).toBe(true);

    rerender(<StoryForm initial={makeStory()} onSave={vi.fn()} saved />);
    expect(screen.getByTestId('story-saved').textContent).toBe('Saved');
    await user.type(screen.getByLabelText('Title'), '!');
    expect(screen.queryByTestId('story-saved')).toBeNull();
  });

  it('tells its container when it starts and stops holding unsaved edits', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderWithTheme(
      <StoryForm initial={makeStory()} onSave={vi.fn()} onDirtyChange={onDirtyChange} />,
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    const title = screen.getByLabelText('Title');
    await user.type(title, '!');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.type(title, '{Backspace}');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('counts as unsaved only what a save would store differently — never a space the save rule trims', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderWithTheme(
      <StoryForm
        initial={makeStory({ tags: ['postgres', 'scaling'] })}
        saved
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.type(screen.getByLabelText('Result'), '   ');
    await user.type(screen.getByLabelText('Title'), ' ');
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    expect(screen.getByTestId('story-saved')).toBeTruthy();

    // The same tags typed another way are the same tags, once they are all there again.
    const tags = screen.getByLabelText('Tags (comma separated)');
    await user.clear(tags);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.type(tags, 'postgres,scaling , postgres');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('story-saved')).toBeTruthy();

    await user.type(screen.getByLabelText('Result'), 'and stayed there.');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId('story-saved')).toBeNull();
  });

  it('[STAR-1] is busy, not disabled, while a save is on its way: Save keeps the focus and a second press sends nothing', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = renderWithTheme(<StoryForm initial={makeStory()} onSave={onSave} />);
    const save = screen.getByTestId('save-story') as HTMLButtonElement;
    save.focus();

    rerender(<StoryForm initial={makeStory()} onSave={onSave} saving />);
    expect(save.disabled).toBe(false);
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(save.textContent).toBe('Saving…');
    expect(document.activeElement).toBe(save);
    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('[STAR-1] starts again in place from the story a save stored: its fields show it, nothing is unsaved, and the focus stays put', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    const before = makeStory();
    const { rerender } = renderWithTheme(
      <StoryForm initial={before} onSave={vi.fn()} onDirtyChange={onDirtyChange} />,
    );
    const title = screen.getByLabelText('Title') as HTMLInputElement;
    await user.type(title, '  again  ');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    // The container hands over what was stored — trimmed.
    rerender(
      <StoryForm
        initial={makeStory({ title: `${before.title} again` })}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
        saved
      />,
    );
    expect(screen.getByLabelText('Title')).toBe(title);
    expect(title.value).toBe(`${before.title} again`);
    expect(document.activeElement).toBe(title);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('story-saved')).toBeTruthy();
  });

  it('shows a delete button only when a handler is supplied', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderWithTheme(<StoryForm initial={makeStory()} onSave={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByTestId('delete-story'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
