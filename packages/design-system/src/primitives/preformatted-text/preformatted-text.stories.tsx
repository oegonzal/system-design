import type { Meta, StoryObj } from '@storybook/react-vite';

import { PreformattedText } from './preformatted-text';

const meta: Meta<typeof PreformattedText> = {
  title: 'Design System/Primitives/PreformattedText',
  component: PreformattedText,
  args: {
    label: 'Prompt',
    text: [
      '# Design an order-history service',
      '',
      '## Functional requirements',
      '1. A shopper reads their merged order history.',
      '2. An online order is visible within a minute.',
      '',
      '## Scale targets',
      '| Metric | Target |',
      '| --- | --- |',
      '| Peak reads | 2,000 rps |',
    ].join('\n'),
  },
};
export default meta;

type Story = StoryObj<typeof PreformattedText>;

/** Markdown shown as written — headings, tables and ids stay verbatim. */
export const Markdown: Story = {};

/** A rendered artifact with the bracketed ids a finding cites. */
export const RenderedArtifact: Story = {
  args: {
    label: 'Rendered canvas',
    text: [
      '## Nodes',
      '[node.1] n-1 kind=client label="Shopper"',
      '[node.2] n-2 kind=service label="History service" ops=[query listOrders]',
      '## Edges',
      '[edge.1] e-1: n-1 -> n-2 (sync) carries=[listOrders]',
    ].join('\n'),
  },
};

/** A long line wraps instead of scrolling sideways. */
export const LongLine: Story = {
  args: {
    label: 'One long line',
    text: 'word '.repeat(120).trim(),
  },
};
