import {
  NODE_CONFIG_KEYS_BOUND,
  NODE_CONFIG_STRING_VALUE_BOUND,
  type NodeConfigEntry,
} from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfigEditor } from './config-editor';

const NONE: NodeConfigEntry[] = [];
const noop = () => undefined;

/** Controlled harness — the panel wires `onChange` back into the store the same way. */
function Harness({
  initial = NONE,
  onChange = noop,
}: {
  initial?: NodeConfigEntry[];
  onChange?: (next: NodeConfigEntry[]) => void;
}) {
  const [config, setConfig] = useState(initial);
  return (
    <ConfigEditor
      config={config}
      onChange={(next) => {
        setConfig(next);
        onChange(next);
      }}
    />
  );
}

describe('ConfigEditor', () => {
  it('renders one row per entry with the value and its type', () => {
    renderWithTheme(
      <Harness
        initial={[
          { key: 'replicas', value: 3 },
          { key: 'dlq', value: true },
          { key: 'strategy', value: 'cache-aside' },
        ]}
      />,
    );

    expect(within(screen.getByTestId('config-row-replicas')).getByText('3')).toBeTruthy();
    expect(screen.getByTestId('config-type-replicas').textContent).toContain('number');
    expect(screen.getByTestId('config-type-dlq').textContent).toContain('boolean');
    expect(screen.getByTestId('config-type-strategy').textContent).toContain('string');
  });

  it('[UX-9] adds a typed entry from the key/value draft and clears the draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness onChange={onChange} />);

    await user.type(screen.getByTestId('config-key'), ' replicas ');
    await user.type(screen.getByTestId('config-value'), '3');
    await user.click(screen.getByTestId('config-add'));

    expect(onChange).toHaveBeenLastCalledWith([{ key: 'replicas', value: 3 }]);
    expect((screen.getByTestId('config-key') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('config-type-replicas').textContent).toContain('number');
  });

  it('commits on Enter in either field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness onChange={onChange} />);

    await user.type(screen.getByTestId('config-key'), 'dlq');
    await user.type(screen.getByTestId('config-value'), 'true{Enter}');

    expect(onChange).toHaveBeenLastCalledWith([{ key: 'dlq', value: true }]);
  });

  it('refuses a duplicate key with an inline error, and a blank one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={[{ key: 'replicas', value: 1 }]} onChange={onChange} />);

    await user.type(screen.getByTestId('config-key'), 'replicas');
    expect(screen.getByTestId('config-error').textContent).toContain('already set');
    expect((screen.getByTestId('config-add') as HTMLButtonElement).disabled).toBe(true);

    await user.clear(screen.getByTestId('config-key'));
    await user.type(screen.getByTestId('config-key'), '   ');
    expect(screen.getByTestId('config-error').textContent).toContain('blank');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes an entry via its named remove button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(
      <Harness
        initial={[
          { key: 'replicas', value: 1 },
          { key: 'dlq', value: true },
        ]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove config replicas' }));

    expect(onChange).toHaveBeenCalledWith([{ key: 'dlq', value: true }]);
    expect(screen.queryByTestId('config-row-replicas')).toBeNull();
  });

  it(`caps entries at the contract's ${NODE_CONFIG_KEYS_BOUND.target}: the draft disables`, () => {
    const full = Array.from({ length: NODE_CONFIG_KEYS_BOUND.target }, (_, index) => ({
      key: `k${index}`,
      value: index,
    }));
    renderWithTheme(<Harness initial={full} />);

    expect((screen.getByTestId('config-key') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('config-add') as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(
        new RegExp(`${NODE_CONFIG_KEYS_BOUND.target} of ${NODE_CONFIG_KEYS_BOUND.target}`),
      ),
    ).toBeTruthy();
  });

  it('[UX-9] says how much of a value’s limit is left as it nears, and that it was reached — a long value is never cut off unsaid', () => {
    renderWithTheme(<Harness />);
    const value = screen.getByTestId('config-value');
    const editor = within(screen.getByTestId('config-editor'));

    fireEvent.change(value, {
      target: { value: 'buffers up to 64 MB while the stream is unreachable' },
    });
    expect(editor.queryByText(/characters? left/)).toBeNull();

    fireEvent.change(value, {
      target: { value: 'x'.repeat(NODE_CONFIG_STRING_VALUE_BOUND.target - 5) },
    });
    expect(editor.getByText('5 characters left')).toBeTruthy();

    fireEvent.change(value, {
      target: { value: 'x'.repeat(NODE_CONFIG_STRING_VALUE_BOUND.target) },
    });
    expect(
      editor.getByText(
        `Limit reached — ${NODE_CONFIG_STRING_VALUE_BOUND.target} characters at most.`,
      ),
    ).toBeTruthy();
  });
});
