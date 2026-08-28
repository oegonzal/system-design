import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button } from './button';

/**
 * `onClick` is an action arg on the meta, so every story logs its clicks in
 * the Actions panel — the callback contract is visible rather than described.
 */
const meta: Meta<typeof Button> = {
  title: 'Design System/Primitives/Button',
  component: Button,
  args: { children: 'Run evaluation', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['solid', 'subtle', 'ghost'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    selected: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

/** The filled call to action. One per view. */
export const Solid: Story = { args: { variant: 'solid', size: 'md' } };

/** The default. Tinted, sits in toolbars and panels. */
export const Subtle: Story = { args: { children: 'Add node' } };

/** Disappears into its surface until hovered — rows of secondary actions. */
export const Ghost: Story = { args: { variant: 'ghost', children: 'Dismiss' } };

/**
 * Passing `selected` opts the button into `aria-pressed`; omitting it leaves
 * the attribute off, which is what a button that acts rather than toggles
 * wants.
 */
export const Selected: Story = { args: { selected: true, children: 'Snap to grid' } };

export const Unselected: Story = { args: { selected: false, children: 'Snap to grid' } };

export const DisabledSolid: Story = {
  args: { variant: 'solid', size: 'md', disabled: true },
};

export const DisabledSubtle: Story = { args: { disabled: true, children: 'Add node' } };

/** Every combination in one frame, for eyeballing a token change. */
export const Matrix: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16 }}>
      <Button {...args} variant="solid" size="md">
        solid / md
      </Button>
      <Button {...args} variant="solid" size="sm">
        solid / sm
      </Button>
      <Button {...args} variant="subtle" size="md">
        subtle / md
      </Button>
      <Button {...args} variant="subtle" size="sm">
        subtle / sm
      </Button>
      <Button {...args} variant="ghost" size="sm">
        ghost / sm
      </Button>
      <Button {...args} selected>
        selected
      </Button>
      <Button {...args} disabled>
        disabled
      </Button>
    </div>
  ),
};
