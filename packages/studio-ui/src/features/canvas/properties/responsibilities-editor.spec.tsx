import { NODE_RESPONSIBILITIES_BOUND, RESPONSIBILITY_BOUND } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ResponsibilitiesEditor } from './responsibilities-editor';

const NONE: string[] = [];
const noop = () => undefined;

function Harness({
  initial = NONE,
  onChange = noop,
}: {
  initial?: string[];
  onChange?: (next: string[]) => void;
}) {
  const [responsibilities, setResponsibilities] = useState(initial);
  return (
    <ResponsibilitiesEditor
      responsibilities={responsibilities}
      onChange={(next) => {
        setResponsibilities(next);
        onChange(next);
      }}
    />
  );
}

describe('ResponsibilitiesEditor', () => {
  it('renders one chip per responsibility with a named remove button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={['owns orders', 'publishes events']} onChange={onChange} />);

    expect(screen.getByText('owns orders')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove responsibility owns orders' }));

    expect(onChange).toHaveBeenCalledWith(['publishes events']);
    expect(screen.queryByText('owns orders')).toBeNull();
  });

  it('commits a trimmed entry on Enter and clears the draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness onChange={onChange} />);

    const input = screen.getByLabelText('Add responsibility') as HTMLInputElement;
    await user.type(input, '  owns the order lifecycle  {Enter}');

    expect(onChange).toHaveBeenCalledWith(['owns the order lifecycle']);
    expect(input.value).toBe('');
  });

  it('dedupes: an already-declared value never becomes a twin chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={['owns orders']} onChange={onChange} />);

    await user.type(screen.getByLabelText('Add responsibility'), 'owns orders{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByText('owns orders')).toHaveLength(1);
  });

  it(`disables the input at the contract cap of ${NODE_RESPONSIBILITIES_BOUND.target}`, () => {
    const full = Array.from(
      { length: NODE_RESPONSIBILITIES_BOUND.target },
      (_, index) => `role ${index}`,
    );
    renderWithTheme(<Harness initial={full} />);

    expect((screen.getByLabelText('Add responsibility') as HTMLInputElement).disabled).toBe(true);
  });

  it('caps the input length at the contract’s ceiling and shows the helper', () => {
    renderWithTheme(<Harness />);

    expect((screen.getByLabelText('Add responsibility') as HTMLInputElement).maxLength).toBe(
      RESPONSIBILITY_BOUND.ceiling,
    );
    expect(screen.getByText(/what is this component in charge of/i)).toBeTruthy();
  });
});
