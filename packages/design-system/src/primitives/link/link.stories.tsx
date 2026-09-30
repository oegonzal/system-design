import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stack } from '../stack/stack';
import { Text } from '../text/text';
import { Link } from './link';

const meta: Meta<typeof Link> = {
  title: 'Design System/Primitives/Link',
  component: Link,
  args: { href: '#', children: 'the notice on sam.gov' },
  argTypes: { $variant: { control: 'select', options: ['inline', 'nav', 'card'] } },
};
export default meta;

type Story = StoryObj<typeof Link>;

/** In running text: underlined in the accent, the text stays the text colour. */
export const Inline: Story = {
  render: (args) => (
    <Text>
      Read <Link {...args} /> before you bid.
    </Text>
  ),
};

/** A navigation list: quiet items, the current one marked and underlined in the accent. */
export const Nav: Story = {
  render: () => (
    <Stack direction="row" gap={1}>
      <Link href="#" $variant="nav" $active aria-current="page">
        Dashboard
      </Link>
      <Link href="#" $variant="nav">
        Search
      </Link>
      <Link href="#" $variant="nav">
        Pipeline
      </Link>
    </Stack>
  ),
};

/** A whole block as one link, the open one tinted. */
export const Card: Story = {
  render: () => (
    <Stack gap={2}>
      <Link href="#" $variant="card" $active aria-current="true">
        <Text as="span">Additive manufacturing of replacement brackets</Text>
      </Link>
      <Link href="#" $variant="card">
        <Text as="span">Sources Sought: custom software development</Text>
      </Link>
    </Stack>
  ),
};
