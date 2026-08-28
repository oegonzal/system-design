import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button } from '../button/button';
import { Text } from '../text/text';
import { Toolbar } from './toolbar';

const meta: Meta<typeof Toolbar> = {
  title: 'Design System/Primitives/Toolbar',
  component: Toolbar,
  args: { 'aria-label': 'Canvas controls' },
};
export default meta;

type Story = StoryObj<typeof Toolbar>;

export const CanvasControls: Story = {
  render: (args) => (
    <Toolbar {...args}>
      <Button onClick={fn()}>Add node</Button>
      <Button onClick={fn()}>Add edge</Button>
      <Button selected onClick={fn()}>
        Snap to grid
      </Button>
      <Button variant="ghost" onClick={fn()}>
        Clear
      </Button>
    </Toolbar>
  ),
};

/** Mixed content: toolbars group whatever belongs to one instrument panel. */
export const WithStatus: Story = {
  render: (args) => (
    <Toolbar {...args} aria-label="Evaluation actions" gap={4}>
      <Button variant="solid" onClick={fn()}>
        Run evaluation
      </Button>
      <Text tone="muted" size="sm">
        Last run 2 minutes ago
      </Text>
    </Toolbar>
  ),
};
