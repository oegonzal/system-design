import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/button';
import { Text } from '../text/text';
import { VisuallyHidden } from './visually-hidden';

const meta: Meta<typeof VisuallyHidden> = {
  title: 'Design System/Primitives/VisuallyHidden',
  component: VisuallyHidden,
};
export default meta;

type Story = StoryObj<typeof VisuallyHidden>;

/**
 * An icon-only control whose accessible name lives in the hidden span — the
 * canonical use.
 */
export const IconButtonLabel: Story = {
  render: () => (
    <Button variant="ghost">
      <span aria-hidden="true">×</span>
      <VisuallyHidden>Remove node</VisuallyHidden>
    </Button>
  ),
};

/** Extra context for assistive technology that sighted users infer visually. */
export const ExtraContext: Story = {
  render: () => (
    <Text>
      82<VisuallyHidden> out of 100 overall score</VisuallyHidden>
    </Text>
  ),
};
