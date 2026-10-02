import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Text } from '../text/text';
import { Disclosure, DisclosureButton, DisclosurePanel } from './disclosure';

const meta: Meta<typeof Disclosure> = {
  title: 'Design System/Primitives/Disclosure',
  component: Disclosure,
  argTypes: { defaultOpen: { control: 'boolean' } },
  render: (args) => (
    <Disclosure {...args}>
      <DisclosureButton variant="ghost">Technical details</DisclosureButton>
      <DisclosurePanel>
        <Text size="sm" tone="secondary">
          connect ECONNREFUSED 127.0.0.1:3003
        </Text>
      </DisclosurePanel>
    </Disclosure>
  ),
};
export default meta;

type Story = StoryObj<typeof Disclosure>;

/** Folded, as a disclosure starts: the button says it is collapsed and names the panel it controls. */
export const Folded: Story = {};

/** Opened from the start — `defaultOpen` — for a fold whose contents are the point of the page. */
export const Opened: Story = { args: { defaultOpen: true } };

/** A button that reads differently while the panel shows: its label is a function of the state. */
export const LabelledByState: Story = {
  render: () => (
    <Disclosure>
      <DisclosureButton variant="subtle" size="sm">
        {(open) => (open ? 'Hide lessons' : 'Show lessons')}
      </DisclosureButton>
      <DisclosurePanel as="ul">
        <li>Put a cache in front of the primary database before adding read replicas.</li>
        <li>Say what the queue absorbs when the downstream service slows down.</li>
      </DisclosurePanel>
    </Disclosure>
  ),
};

function ControlledExample() {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <Text size="sm">{open ? 'The details are shown.' : 'The details are folded away.'}</Text>
      <DisclosureButton variant="ghost">{open ? 'Hide' : 'Show'}</DisclosureButton>
      <DisclosurePanel>
        <Text size="sm" tone="muted">
          Whoever holds the state can read it: a line beside the button says what the panel is
          doing.
        </Text>
      </DisclosurePanel>
    </Disclosure>
  );
}

/** Controlled: the state is the page's, so something outside the widget can read or set it. */
export const Controlled: Story = { render: () => <ControlledExample /> };
