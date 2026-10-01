import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { revealScrollLeft } from './reveal';
import { Tab, TabList, TabPanel, Tabs, type TabListOverflow } from './tabs';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

const fixture = (value: string, onChange: (next: string) => void) => (
  <Tabs value={value} onChange={onChange}>
    <TabList aria-label="Evaluation detail">
      <Tab value="findings">Findings</Tab>
      <Tab value="scores">Scores</Tab>
      <Tab value="history">History</Tab>
    </TabList>
    <TabPanel value="findings">finding list</TabPanel>
    <TabPanel value="scores">score list</TabPanel>
    <TabPanel value="history">history list</TabPanel>
  </Tabs>
);

describe('Tabs', () => {
  it('marks the selected tab and wires it to its panel', () => {
    renderWithTheme(fixture('scores', vi.fn()));
    const selected = screen.getByRole('tab', { name: 'Scores', selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toBe('score list');
    expect(selected.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(selected.id);
  });

  it('keeps unselected panels mounted but hidden', () => {
    renderWithTheme(fixture('findings', vi.fn()));
    // hidden panels are not in the accessibility tree, but their state survives.
    expect(screen.getByText('score list')).toBeTruthy();
    expect(screen.getByText('score list').hasAttribute('hidden')).toBe(true);
    expect(screen.getByText('finding list').hasAttribute('hidden')).toBe(false);
  });

  it('roves the tabindex: only the selected tab is tabbable', () => {
    renderWithTheme(fixture('scores', vi.fn()));
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('moves selection with the arrow keys, wrapping at the ends', () => {
    const onChange = vi.fn();
    renderWithTheme(fixture('history', onChange));
    const tablist = screen.getByRole('tablist');
    screen.getByRole('tab', { name: 'History' }).focus();

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('findings');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Findings' }));
  });

  it('jumps to the ends with Home and End', () => {
    const onChange = vi.fn();
    renderWithTheme(fixture('scores', onChange));
    const tablist = screen.getByRole('tablist');
    screen.getByRole('tab', { name: 'Scores' }).focus();

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('history');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('findings');
  });

  it('selects on click', () => {
    const onChange = vi.fn();
    renderWithTheme(fixture('findings', onChange));
    fireEvent.click(screen.getByRole('tab', { name: 'Scores' }));
    expect(onChange).toHaveBeenCalledWith('scores');
  });

  describe('overflow="scroll"', () => {
    const SIX = ['prompt', 'brief', 'narrative', 'feedback', 'coach', 'revisions'];
    const TAB_WIDTH = 100;
    const VIEW_WIDTH = 250;

    const row = (value: string, overflow: TabListOverflow = 'scroll') => (
      <Tabs value={value} onChange={vi.fn()}>
        <TabList aria-label="Session panels" overflow={overflow}>
          {SIX.map((tab) => (
            <Tab key={tab} value={tab}>
              {tab}
            </Tab>
          ))}
        </TabList>
      </Tabs>
    );

    /**
     * jsdom has no layout: give each tab a place along the row and the
     * scroller a width and a scroll position it remembers.
     */
    function layOut() {
      const tablist = screen.getByRole('tablist');
      screen.getAllByRole('tab').forEach((tab, index) => {
        Object.defineProperty(tab, 'offsetLeft', { configurable: true, value: index * TAB_WIDTH });
        Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: TAB_WIDTH });
      });
      const scroller = tablist.parentElement as HTMLElement;
      let scrollLeft = 0;
      Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: VIEW_WIDTH });
      Object.defineProperty(scroller, 'scrollLeft', {
        configurable: true,
        get: () => scrollLeft,
        set: (next: number) => {
          scrollLeft = next;
        },
      });
      return { tablist, scroller };
    }

    it('keeps one row that scrolls sideways, inside its own scroller', () => {
      renderWithTheme(row('prompt'));
      const tablist = screen.getByRole('tablist');
      expect(getComputedStyle(tablist).flexWrap).toBe('nowrap');
      expect(getComputedStyle(tablist.parentElement as HTMLElement).overflowX).toBe('auto');
    });

    it('scrolls the selected tab into view however it was chosen, moving no further than it must', () => {
      const { rerender } = renderWithTheme(row('prompt'));
      const { scroller } = layOut();

      // Selected from code — the page opening Feedback after a submit.
      rerender(row('revisions'));
      expect(scroller.scrollLeft).toBe(6 * TAB_WIDTH - VIEW_WIDTH);

      // Already in view: nothing moves.
      rerender(row('coach'));
      expect(scroller.scrollLeft).toBe(6 * TAB_WIDTH - VIEW_WIDTH);

      // Off the start: aligned to the start.
      rerender(row('brief'));
      expect(scroller.scrollLeft).toBe(TAB_WIDTH);
    });

    it('leaves a wrapping list unwrapped in no scroller', () => {
      renderWithTheme(row('prompt', 'wrap'));
      const tablist = screen.getByRole('tablist');
      expect(getComputedStyle(tablist).flexWrap).toBe('wrap');
      expect(getComputedStyle(tablist.parentElement as HTMLElement).overflowX).not.toBe('auto');
    });
  });
});

describe('revealScrollLeft', () => {
  const view = { scrollLeft: 100, width: 200 };

  it('leaves a span already in view where it is', () => {
    expect(revealScrollLeft({ start: 120, end: 280 }, view)).toBe(100);
    expect(revealScrollLeft({ start: 100, end: 300 }, view)).toBe(100);
  });

  it('aligns a span off the start to the start, and one off the end to the end', () => {
    expect(revealScrollLeft({ start: 40, end: 140 }, view)).toBe(40);
    expect(revealScrollLeft({ start: 260, end: 360 }, view)).toBe(160);
  });
});
