import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './text-area-field.stories';

const { Default, Tall, Disabled, WithHint, Invalid, NearLimit, OverTarget, PastCeiling } =
  composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

/** A limited field's own polite region, and what it last said. */
const announcer = () => document.querySelector('[aria-live="polite"]');
const announced = () => announcer()?.textContent;

describe('TextAreaField', () => {
  it('renders a labelled textarea with four rows by default', () => {
    renderWithTheme(<Default />);
    const area = screen.getByLabelText('Design narrative') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.rows).toBe(4);
  });

  it('takes the rows and value it is given', () => {
    renderWithTheme(<Tall />);
    const area = screen.getByLabelText('Design narrative') as HTMLTextAreaElement;
    expect(area.rows).toBe(8);
    expect(area.value).toContain('gateway');
  });

  it('passes disabled through', () => {
    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Design narrative') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('shows a hint under the area and describes the area by it', () => {
    renderWithTheme(<WithHint />);
    const area = screen.getByLabelText('Design narrative');
    expect(document.getElementById(area.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'The graders read this with the diagram: say why each component is there.',
    );
    expect(area.hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows why a value is refused and marks the area invalid', () => {
    renderWithTheme(<Invalid />);
    const area = screen.getByLabelText('Design narrative');
    expect(area.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(area.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Say how a request travels.',
    );
  });

  it('counts what is left of a maxLength as it nears, and says when it is reached', () => {
    renderWithTheme(<NearLimit />);
    const area = screen.getByLabelText('Design narrative');
    const count = () => document.getElementById(area.getAttribute('aria-describedby') ?? '');
    expect(count()?.textContent).toBe('4 characters left');
    expect(announced()).toBe('Nearing the limit of 60 characters.');

    fireEvent.change(area, { target: { value: 'x'.repeat(60) } });
    expect(count()?.textContent).toBe('Limit reached — 60 characters at most.');
    expect(announced()).toBe('Limit of 60 characters reached.');
  });

  it('says nothing of a maxLength while there is room', () => {
    renderWithTheme(<Default maxLength={60} defaultValue="Requests enter through the gateway." />);
    expect(screen.getByLabelText('Design narrative').hasAttribute('aria-describedby')).toBe(false);
  });

  it('[UX-19] given a target under its maxLength, says how far over the ask the prose runs and reaches the limit only at the maxLength', () => {
    renderWithTheme(<OverTarget />);
    const area = screen.getByLabelText('Design narrative') as HTMLTextAreaElement;
    const count = () => document.getElementById(area.getAttribute('aria-describedby') ?? '');
    expect(area.maxLength).toBe(75);
    expect(area.hasAttribute('target')).toBe(false);
    expect(count()?.textContent).toBe('1 over the 60 asked — 75 at most');
    expect(announced()).toBe('At the 60 characters asked — 75 at most.');

    fireEvent.change(area, { target: { value: 'x'.repeat(75) } });
    expect(count()?.textContent).toBe('Limit reached — 75 characters at most.');
    expect(announced()).toBe('Limit of 75 characters reached.');
  });

  it('[UX-22] keeps prose set past its maxLength whole and says how far past the most accepted it runs and that it must be shortened to submit', () => {
    renderWithTheme(<PastCeiling />);
    const area = screen.getByLabelText('Design narrative') as HTMLTextAreaElement;
    const count = () => document.getElementById(area.getAttribute('aria-describedby') ?? '');
    expect(area.value).toHaveLength(88);
    expect(count()?.textContent).toBe('13 characters past the 75 accepted — shorten it to submit.');
    expect(announced()).toBe('Past the limit of 75 characters — shorten it to submit.');
  });
});
