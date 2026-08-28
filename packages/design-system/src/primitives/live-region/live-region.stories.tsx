import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from '../button/button';
import { Stack } from '../stack/stack';
import { Text } from '../text/text';
import { LiveRegion } from './live-region';

const meta: Meta<typeof LiveRegion> = {
  title: 'Design System/Primitives/LiveRegion',
  component: LiveRegion,
  args: { message: 'Evaluation complete: grade B.' },
};
export default meta;

type Story = StoryObj<typeof LiveRegion>;

/** Nothing visible — inspect the DOM, or point a screen reader at it. */
export const Polite: Story = {};

export const Assertive: Story = {
  args: { politeness: 'assertive', message: 'Evaluation failed.' },
};

/**
 * The pattern that actually announces: the region is mounted from the first
 * render, and only its message changes.
 */
export const MountedBeforeSpeaking: Story = {
  render: function MountedBeforeSpeakingStory() {
    const [message, setMessage] = useState('');

    return (
      <Stack gap={3} align="start">
        <Text size="sm" tone="secondary">
          The region below is already in the DOM, empty. The button only changes its text.
        </Text>
        <Button onClick={() => setMessage('Node added: load-balancer.')}>Add node</Button>
        <LiveRegion message={message} />
      </Stack>
    );
  },
};
