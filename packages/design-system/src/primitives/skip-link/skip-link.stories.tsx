import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text } from '../text/text';
import { SkipLink } from './skip-link';

const meta: Meta<typeof SkipLink> = {
  title: 'Design System/Primitives/SkipLink',
  component: SkipLink,
  args: { href: '#main', children: 'Skip to canvas' },
};
export default meta;

type Story = StoryObj<typeof SkipLink>;

/** Invisible until keyboard-focused — press Tab in the preview to reveal it. */
export const Default: Story = {
  render: (args) => (
    <div style={{ position: 'relative', minHeight: 120 }}>
      <SkipLink {...args} />
      <Text tone="secondary" size="sm">
        Press Tab: the link appears at the top-left, first in the tab order.
      </Text>
      <main id="main">
        <Text>The canvas the link jumps to.</Text>
      </main>
    </div>
  ),
};
