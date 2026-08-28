import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Tab, TabList, TabPanel, Tabs } from './tabs';

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
});
