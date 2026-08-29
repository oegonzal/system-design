import { NODE_MAX_RESPONSIBILITIES } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { ResponsibilitiesEditor } from './responsibilities-editor';

const meta: Meta<typeof ResponsibilitiesEditor> = {
  title: 'Studio/Canvas/ResponsibilitiesEditor',
  component: ResponsibilitiesEditor,
};
export default meta;

type Story = StoryObj<typeof ResponsibilitiesEditor>;

function Controlled({ initial }: { initial: string[] }) {
  const [responsibilities, setResponsibilities] = useState(initial);
  return (
    <ResponsibilitiesEditor responsibilities={responsibilities} onChange={setResponsibilities} />
  );
}

/** A service that knows what it owns. */
export const WithChips: Story = {
  render: () => <Controlled initial={['Owns the order lifecycle', 'Publishes order events']} />,
};

/** Nothing declared yet — just the prompt to start. */
export const Empty: Story = {
  render: () => <Controlled initial={[]} />,
};

/** Six of six: the input disables rather than letting a seventh in. */
export const AtCapacity: Story = {
  render: () => (
    <Controlled
      initial={Array.from(
        { length: NODE_MAX_RESPONSIBILITIES },
        (_, index) => `Responsibility ${index + 1}`,
      )}
    />
  ),
};
