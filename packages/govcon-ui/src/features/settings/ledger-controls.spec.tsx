import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './ledger-controls.stories';

const { Default, Descriptions } = composeStories(stories);

describe('LedgerControls', () => {
  it('narrows the ledger to one operation and pages it', () => {
    const onOperationChange = vi.fn();
    const onPage = vi.fn();
    renderWithTheme(<Default onOperationChange={onOperationChange} onPage={onPage} />);
    expect(screen.getByText('51–100 of 120')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'awards' } });
    expect(onOperationChange).toHaveBeenCalledWith('awards');
    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(onPage).toHaveBeenCalledWith(100);
    fireEvent.click(screen.getByRole('button', { name: 'Newer' }));
    expect(onPage).toHaveBeenCalledWith(0);
    renderWithTheme(<Descriptions />);
    expect(
      (screen.getAllByRole('button', { name: 'Older' })[1] as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
