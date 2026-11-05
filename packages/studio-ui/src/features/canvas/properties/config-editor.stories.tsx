import { NODE_CONFIG_KEYS_BOUND, type ConfigEntry } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { ConfigEditor } from './config-editor';

const meta: Meta<typeof ConfigEditor> = {
  title: 'Studio/Canvas/ConfigEditor',
  component: ConfigEditor,
};
export default meta;

type Story = StoryObj<typeof ConfigEditor>;

/** Controlled the way the panel controls it: state out, changes back in. */
function Controlled({ initial }: { initial: ConfigEntry[] }) {
  const [config, setConfig] = useState(initial);
  return <ConfigEditor config={config} keysBound={NODE_CONFIG_KEYS_BOUND} onChange={setConfig} />;
}

/** Nothing configured yet — the draft row invites the first entry. */
export const Empty: Story = { render: () => <Controlled initial={[]} /> };

/** One entry per type: a number, a flag, text — each badged by what was typed. */
export const Typed: Story = {
  render: () => (
    <Controlled
      initial={[
        { key: 'replicas', value: 3 },
        { key: 'dlq', value: true },
        { key: 'strategy', value: 'cache-aside' },
        { key: 'schedule', value: '0 2 * * *' },
      ]}
    />
  ),
};

/** Keys worth setting, as chips: a click fills the draft's key, the author writes the value. */
export const WithHints: Story = {
  render: () => (
    <ConfigEditorWithHints
      initial={[{ key: 'dlq', value: true }]}
      hints={['dlq', 'retries', 'timeoutMs', 'delivery']}
    />
  ),
};

function ConfigEditorWithHints({
  initial,
  hints,
}: {
  initial: ConfigEntry[];
  hints: readonly string[];
}) {
  const [config, setConfig] = useState(initial);
  return (
    <ConfigEditor
      config={config}
      keysBound={NODE_CONFIG_KEYS_BOUND}
      hints={hints}
      onChange={setConfig}
    />
  );
}

/** The contract cap: the draft row disables and the counter reads full. */
export const AtCapacity: Story = {
  render: () => (
    <Controlled
      initial={Array.from({ length: NODE_CONFIG_KEYS_BOUND.target }, (_, index) => ({
        key: `setting${index + 1}`,
        value: index + 1,
      }))}
    />
  ),
};
