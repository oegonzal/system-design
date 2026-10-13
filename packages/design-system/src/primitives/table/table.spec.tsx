import { act, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Table } from './table';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Table', () => {
  it('is a real table, found by its label, with real column headers', () => {
    renderWithTheme(
      <Table aria-label="Leads">
        <thead>
          <tr>
            <th>Score</th>
            <th>Title</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>71.5</td>
            <td>Junction box</td>
          </tr>
        </tbody>
      </Table>,
    );
    const table = screen.getByRole('table', { name: 'Leads' });
    expect(table.tagName).toBe('TABLE');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Score', 'Title']);
    expect(within(table).getByRole('cell', { name: 'Junction box' })).toBeTruthy();
  });

  describe('in a column narrower than its columns', () => {
    /** jsdom has no layout: stand a ResizeObserver in whose callbacks the spec fires once it has given the frame its widths. */
    const layoutWatchers: (() => void)[] = [];
    afterEach(() => {
      layoutWatchers.length = 0;
      vi.unstubAllGlobals();
    });

    function renderMeasured() {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          readonly observe = vi.fn();
          readonly disconnect = vi.fn();
          constructor(callback: () => void) {
            layoutWatchers.push(callback);
          }
        },
      );
      renderWithTheme(
        <Table aria-label="Leads">
          <tbody>
            <tr>
              <td>Junction box</td>
            </tr>
          </tbody>
        </Table>,
      );
      const frame = screen.getByRole('table', { name: 'Leads' }).parentElement as HTMLElement;
      const layOut = (clientWidth: number, scrollWidth: number) => {
        Object.defineProperty(frame, 'clientWidth', { configurable: true, value: clientWidth });
        Object.defineProperty(frame, 'scrollWidth', { configurable: true, value: scrollWidth });
        act(() => layoutWatchers.forEach((settle) => settle()));
      };
      return { frame, layOut };
    }

    it('scrolls sideways inside its own frame, never wider than its column', () => {
      const { frame } = renderMeasured();
      expect(getComputedStyle(frame).overflowX).toBe('auto');
      expect(getComputedStyle(frame).maxWidth).toBe('100%');
    });

    it('is a named region a keyboard can focus while it holds more than it shows, and nothing once it fits', () => {
      const { frame, layOut } = renderMeasured();
      expect(screen.queryByRole('region')).toBeNull();
      expect(frame.hasAttribute('tabindex')).toBe(false);

      layOut(320, 900);
      const region = screen.getByRole('region', { name: 'Leads, scrolls sideways' });
      expect(region).toBe(frame);
      expect(region.getAttribute('tabindex')).toBe('0');

      layOut(1024, 900);
      expect(screen.queryByRole('region')).toBeNull();
      expect(frame.hasAttribute('tabindex')).toBe(false);
    });
  });
});
