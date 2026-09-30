import type { Meta, StoryObj } from '@storybook/react-vite';

import { Markdown } from './markdown';

const meta: Meta<typeof Markdown> = {
  title: 'Design System/Primitives/Markdown',
  component: Markdown,
  args: {
    label: 'Prompt',
    text: [
      '# Design an order-history service',
      '',
      '## Scenario',
      'Online orders live in a hosted storefront that pushes webhooks; in-store orders live in a POS that only answers polling. Merge both into one per-customer history.',
      '',
      '## Functional requirements',
      '1. A shopper reads their merged order history.',
      '2. An online order is visible within a minute.',
      '',
      '## Scale targets',
      '| Metric | Target |',
      '| --- | --- |',
      '| Peak reads | 2,000 rps |',
      '| Order events | 50 per second, bursting to 500 |',
      '',
      '## Constraints',
      '- The storefront only delivers orders by webhook',
      '- The POS exposes `GET /orders?since=` and nothing else',
      '',
      '> Assume a single region to start; say what changes for two.',
    ].join('\n'),
  },
};
export default meta;

type Story = StoryObj<typeof Markdown>;

/** A prompt as the model wrote it: headings stepped under the label, a table, a quote. */
export const Prompt: Story = {};

/** Every block GitHub flavour adds: task list, strikethrough, fenced code, a rule, a link. */
export const GitHubFlavour: Story = {
  args: {
    label: 'Library preview',
    text: [
      '### Checklist',
      '- [x] Capacity estimate',
      '- [ ] Failure modes',
      '',
      'Prefer ~~polling~~ webhooks. See the [API guide](https://example.com/guide).',
      '',
      '```ts',
      'const history = await orders.list({ customerId, since });',
      '```',
      '',
      '---',
      '',
      '#### Notes',
      '##### Smaller',
      '###### Smallest',
    ].join('\n'),
  },
};

/** A long line wraps instead of scrolling sideways; a wide table scrolls on its own. */
export const WideContent: Story = {
  args: {
    label: 'Wide',
    text: [
      'word '.repeat(80).trim(),
      '',
      '| A | B | C | D | E | F | G | H |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      `| ${Array.from({ length: 8 }, () => 'a value that is rather long').join(' | ')} |`,
    ].join('\n'),
  },
};
