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

  it('shows a delete button only when a handler is supplied', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderWithTheme(<StoryForm initial={makeStory()} onSave={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByTestId('delete-story'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
