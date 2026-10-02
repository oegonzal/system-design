import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { hiddenEnds, pageScrollLeft, revealScrollLeft } from './reveal';
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
    /** What an edge covers: `theme.space[6]`, which a revealed tab stays clear of. */
    const EDGE = 24;
    const FURTHEST = SIX.length * TAB_WIDTH - VIEW_WIDTH;

    const row = (value: string, overflow: TabListOverflow = 'scroll', tabs = SIX) => (
      <Tabs value={value} onChange={vi.fn()}>
        <TabList aria-label="Session panels" overflow={overflow}>
          {tabs.map((tab) => (
            <Tab key={tab} value={tab}>
              {tab}
            </Tab>
          ))}
        </TabList>
      </Tabs>
    );

    /** jsdom has no layout and so no ResizeObserver: stand one in whose callbacks a spec fires when its layout "settles". */
    const layoutWatchers: (() => void)[] = [];
    beforeEach(() => {
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
    });
    afterEach(() => {
      layoutWatchers.length = 0;
      vi.unstubAllGlobals();
    });

    /**
     * Gives each tab a place along the row, and the scroller a width, a row
     * width and a scroll position it keeps within the row — then lets the
     * layout settle. A browser tells of a scroll on a later frame, never
     * inside the write: `scrolled()` is that frame.
     */
    function layOut() {
      const tablist = screen.getByRole('tablist');
      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab, index) => {
        Object.defineProperty(tab, 'offsetLeft', { configurable: true, value: index * TAB_WIDTH });
        Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: TAB_WIDTH });
      });
      const scroller = tablist.parentElement as HTMLElement;
      const contentWidth = tabs.length * TAB_WIDTH;
      let scrollLeft = 0;
      Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: VIEW_WIDTH });
      Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: contentWidth });
      Object.defineProperty(scroller, 'scrollLeft', {
        configurable: true,
        get: () => scrollLeft,
        set: (next: number) => {
          scrollLeft = Math.min(Math.max(0, next), Math.max(0, contentWidth - VIEW_WIDTH));
        },
      });
      act(() => layoutWatchers.forEach((settle) => settle()));
      return { tablist, scroller, scrolled: () => fireEvent.scroll(scroller) };
    }

    const edge = (end: 'start' | 'end') =>
      document.querySelector<HTMLButtonElement>(`[data-tabs-edge="${end}"]`);

    it('keeps one row that scrolls sideways, inside its own scroller', () => {
      renderWithTheme(row('prompt'));
      const tablist = screen.getByRole('tablist');
      expect(getComputedStyle(tablist).flexWrap).toBe('nowrap');
      expect(getComputedStyle(tablist.parentElement as HTMLElement).overflowX).toBe('auto');
    });

    it('scrolls the selected tab wholly into view however it was chosen, moving no further than it must', () => {
      const { rerender } = renderWithTheme(row('prompt'));
      const { scroller } = layOut();

      // Selected from code — the page opening Revisions after a submit. The row's own end: flush.
      rerender(row('revisions'));
      expect(scroller.scrollLeft).toBe(FURTHEST);

      // Already in view, clear of the start edge: nothing moves.
      rerender(row('coach'));
      expect(scroller.scrollLeft).toBe(FURTHEST);

      // Off the start: brought to the start, clear of the edge that now covers Prompt.
      rerender(row('brief'));
      expect(scroller.scrollLeft).toBe(TAB_WIDTH - EDGE);

      // Partly in view is not in view: Feedback is brought clear of the end edge that covers Coach.
      rerender(row('feedback'));
      expect(scroller.scrollLeft).toBe(4 * TAB_WIDTH + EDGE - VIEW_WIDTH);
    });

    it('brings the selected tab back into view when the layout changes under it', () => {
      renderWithTheme(row('revisions'));
      const { scroller } = layOut();
      expect(scroller.scrollLeft).toBe(FURTHEST);
    });

    it('marks each end that holds tabs out of view, and only those', () => {
      const { rerender } = renderWithTheme(row('prompt'));
      const { scrolled } = layOut();
      expect(edge('start')).toBeNull();
      expect(edge('end')).not.toBeNull();

      rerender(row('narrative'));
      scrolled();
      expect(edge('start')).not.toBeNull();
      expect(edge('end')).not.toBeNull();

      rerender(row('revisions'));
      scrolled();
      expect(edge('start')).not.toBeNull();
      expect(edge('end')).toBeNull();
    });

    it('marks no end of a row that fits', () => {
      renderWithTheme(row('prompt', 'scroll', SIX.slice(0, 2)));
      layOut();
      expect(edge('start')).toBeNull();
      expect(edge('end')).toBeNull();
    });

    it('pages toward an end on its edge button, a view less the edges at a time', () => {
      renderWithTheme(row('prompt'));
      const { scroller, scrolled } = layOut();

      fireEvent.click(edge('end') as HTMLButtonElement);
      expect(scroller.scrollLeft).toBe(VIEW_WIDTH - 2 * EDGE);
      fireEvent.click(edge('end') as HTMLButtonElement);
      expect(scroller.scrollLeft).toBe(FURTHEST);
      scrolled();
      expect(edge('end')).toBeNull();

      fireEvent.click(edge('start') as HTMLButtonElement);
      expect(scroller.scrollLeft).toBe(FURTHEST - (VIEW_WIDTH - 2 * EDGE));
    });

    it('keeps the edge buttons a pointer’s affordance: out of the tab order, hidden from assistive technology, never focused', () => {
      renderWithTheme(row('prompt'));
      layOut();
      const button = edge('end') as HTMLButtonElement;
      expect(button.tabIndex).toBe(-1);
      expect(button.getAttribute('aria-hidden')).toBe('true');
      // The tablist holds tabs and nothing else.
      expect(screen.getByRole('tablist').contains(button)).toBe(false);
      // A prevented mousedown is what leaves focus on the tab that had it.
      expect(fireEvent.mouseDown(button)).toBe(false);
    });

    it('leaves a wrapping list unwrapped in no scroller, with no edges', () => {
      renderWithTheme(row('prompt', 'wrap'));
      const tablist = screen.getByRole('tablist');
      expect(getComputedStyle(tablist).flexWrap).toBe('wrap');
      expect(getComputedStyle(tablist.parentElement as HTMLElement).overflowX).not.toBe('auto');
      expect(edge('start')).toBeNull();
      expect(edge('end')).toBeNull();
    });
  });
});

describe('revealScrollLeft', () => {
  const view = { scrollLeft: 100, width: 200, contentWidth: 600 };

  it('leaves a span already in view where it is', () => {
    expect(revealScrollLeft({ start: 120, end: 280 }, view)).toBe(100);
    expect(revealScrollLeft({ start: 100, end: 300 }, view)).toBe(100);
  });

  it('aligns a span off the start to the start, and one off the end to the end', () => {
    expect(revealScrollLeft({ start: 40, end: 140 }, view)).toBe(40);
    expect(revealScrollLeft({ start: 260, end: 360 }, view)).toBe(160);
  });

  it('counts a span under an edge as out of view, and brings it clear of the edge', () => {
    expect(revealScrollLeft({ start: 110, end: 200 }, view, 24)).toBe(86);
    expect(revealScrollLeft({ start: 200, end: 290 }, view, 24)).toBe(114);
    expect(revealScrollLeft({ start: 124, end: 276 }, view, 24)).toBe(100);
  });

  it('sits a span at the row’s own end flush, where there is no edge to clear', () => {
    expect(revealScrollLeft({ start: 10, end: 90 }, view, 24)).toBe(0);
    expect(revealScrollLeft({ start: 520, end: 600 }, view, 24)).toBe(400);
  });
});

describe('hiddenEnds', () => {
  it('names the ends the row runs past, treating a sub-pixel remainder as the end', () => {
    expect(hiddenEnds({ scrollLeft: 0, width: 200, contentWidth: 600 })).toEqual({
      start: false,
      end: true,
    });
    expect(hiddenEnds({ scrollLeft: 100, width: 200, contentWidth: 600 })).toEqual({
      start: true,
      end: true,
    });
    expect(hiddenEnds({ scrollLeft: 399.5, width: 200, contentWidth: 600 })).toEqual({
      start: true,
      end: false,
    });
    expect(hiddenEnds({ scrollLeft: 0, width: 200, contentWidth: 200 })).toEqual({
      start: false,
      end: false,
    });
  });
});

describe('pageScrollLeft', () => {
  const view = { scrollLeft: 100, width: 200, contentWidth: 600 };

  it('moves a view less the edges toward an end, and stops at the row’s ends', () => {
    expect(pageScrollLeft(view, 'end', 24)).toBe(252);
    expect(pageScrollLeft(view, 'start', 24)).toBe(0);
    expect(pageScrollLeft({ ...view, scrollLeft: 300 }, 'end', 24)).toBe(400);
  });

  it('goes to the end rather than leave a sliver under the edge for another press', () => {
    expect(pageScrollLeft({ ...view, scrollLeft: 170 }, 'start', 24)).toBe(0);
    expect(pageScrollLeft({ ...view, scrollLeft: 230 }, 'end', 24)).toBe(400);
    // A whole edge's width and more is still a page of its own.
    expect(pageScrollLeft({ ...view, scrollLeft: 180 }, 'start', 24)).toBe(28);
  });
});
