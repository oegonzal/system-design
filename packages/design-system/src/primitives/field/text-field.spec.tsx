import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './text-field.stories';

const {
  Default,
  ExplicitId,
  Disabled,
  Numeric,
  WithHint,
  Invalid,
  NearLimit,
  AtLimit,
  CountedThroughout,
  OverTarget,
  AtCeiling,
} = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

/** A limited field's own polite region, and what it last said. */
const announcer = () => document.querySelector('[aria-live="polite"]');
const announced = () => announcer()?.textContent;

describe('TextField', () => {
  it('associates the label with the input', () => {
    renderWithTheme(<Default />);
    expect(screen.getByLabelText('Service name').tagName).toBe('INPUT');
  });

  it('honours an explicit id and points the label at it', () => {
    renderWithTheme(<ExplicitId />);
    const input = screen.getByLabelText('Service name');
    expect(input.id).toBe('service-name');
    expect(document.querySelector('label[for="service-name"]')?.textContent).toBe('Service name');
  });

  it('passes native attributes through to the control', () => {
    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Service name') as HTMLInputElement).disabled).toBe(true);
  });

  it('marks a refused value invalid and describes it by the reason shown under it, and nothing while valid', () => {
    renderWithTheme(<Invalid />);
    const input = screen.getByLabelText('Service name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const reason = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('A service needs a name.');

    const { container } = renderWithTheme(<Default label="Owner" aria-describedby="hint" />);
    const valid = container.querySelector('input');
    expect(valid?.hasAttribute('aria-invalid')).toBe(false);
    expect(valid?.getAttribute('aria-describedby')).toBe('hint');
  });

  it('keeps the caller’s own description alongside the reason', () => {
    renderWithTheme(<Invalid aria-describedby="hint" />);
    const describedBy = screen.getByLabelText('Service name').getAttribute('aria-describedby');
    expect(describedBy?.split(' ')[0]).toBe('hint');
    expect(describedBy?.split(' ')).toHaveLength(2);
  });

  it('shows a hint under the control, describes the control by it, and keeps it while the value is typed', () => {
    renderWithTheme(<WithHint />);
    const input = screen.getByLabelText('Notes');
    const hint = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe(
      'Read by the graders — e.g. retries, ordering, what it guarantees',
    );
    expect(input.hasAttribute('placeholder')).toBe(false);

    fireEvent.change(input, { target: { value: 'retries three times' } });
    expect(
      screen.getByText('Read by the graders — e.g. retries, ordering, what it guarantees'),
    ).toBeTruthy();
  });

  it('describes the control by the hint before the count and the reason, after the caller’s own description', () => {
    renderWithTheme(
      <NearLimit
        id="service-name"
        hint="What the service is called"
        error="That name is taken."
        aria-describedby="outside"
      />,
    );
    expect(screen.getByLabelText('Service name').getAttribute('aria-describedby')).toBe(
      'outside service-name-hint service-name-limit service-name-error',
    );
  });

  it('is any input type the caller asks for', () => {
    renderWithTheme(<Numeric />);
    const input = screen.getByLabelText('Iterations') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.max).toBe('10');
  });

  describe('with a maxLength', () => {
    /** What describes the control, as one string per description. */
    const descriptionsOf = (input: HTMLElement) =>
      (input.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .filter((id) => id.length > 0)
        .map((id) => document.getElementById(id)?.textContent);

    it('says nothing while there is room, and has its announcer waiting', () => {
      renderWithTheme(<Default maxLength={20} defaultValue="checkout" />);
      expect(screen.queryByText(/left$/)).toBeNull();
      expect(screen.getByLabelText('Service name').hasAttribute('aria-describedby')).toBe(false);
      expect(announced()).toBe('');
    });

    it('counts what is left once the limit nears, describes the control by it, and announces the stretch once', () => {
      renderWithTheme(<NearLimit />);
      const input = screen.getByLabelText('Service name');
      expect(descriptionsOf(input)).toEqual(['2 characters left']);
      expect(announced()).toBe('Nearing the limit of 20 characters.');

      // One more character: the count moves, the announcement does not.
      fireEvent.change(input, { target: { value: 'order-history-reads' } });
      expect(descriptionsOf(input)).toEqual(['1 character left']);
      expect(announced()).toBe('Nearing the limit of 20 characters.');
    });

    it('says the limit is reached, by name, and announces it', () => {
      renderWithTheme(<AtLimit />);
      expect(descriptionsOf(screen.getByLabelText('Service name'))).toEqual([
        'Limit reached — 20 characters at most.',
      ]);
      expect(announced()).toBe('Limit of 20 characters reached.');
    });

    it('follows an uncontrolled field as it is typed into, and still calls the caller’s onChange', () => {
      const onChange = vi.fn();
      renderWithTheme(<Default maxLength={20} onChange={onChange} />);
      const input = screen.getByLabelText('Service name');

      fireEvent.change(input, { target: { value: 'order-history-reader' } });
      expect(descriptionsOf(input)).toEqual(['Limit reached — 20 characters at most.']);
      expect(onChange).toHaveBeenCalledTimes(1);

      fireEvent.change(input, { target: { value: 'orders' } });
      expect(descriptionsOf(input)).toEqual([]);
      expect(announced()).toBe('');
    });

    it('measures a controlled field by its value', () => {
      const { rerender } = renderWithTheme(<Default maxLength={20} value="orders" readOnly />);
      expect(descriptionsOf(screen.getByLabelText('Service name'))).toEqual([]);

      rerender(<Default maxLength={20} value="order-history-read" readOnly />);
      expect(descriptionsOf(screen.getByLabelText('Service name'))).toEqual(['2 characters left']);
    });

    it('counts from the first character when asked to, and announces nothing until the limit nears', () => {
      renderWithTheme(<CountedThroughout />);
      expect(descriptionsOf(screen.getByLabelText('Service name'))).toEqual(['32 characters left']);
      expect(announced()).toBe('');
    });

    it('keeps the count beside the caller’s description and the reason a value is refused', () => {
      renderWithTheme(
        <NearLimit aria-describedby="hint" error="That name is taken." id="service-name" />,
      );
      expect(screen.getByLabelText('Service name').getAttribute('aria-describedby')).toBe(
        'hint service-name-limit service-name-error',
      );
    });

    it('leaves the cap unspoken when told never to speak of it', () => {
      renderWithTheme(<AtLimit limitNotice="never" />);
      expect(screen.getByLabelText('Service name').hasAttribute('aria-describedby')).toBe(false);
      expect(announcer()).toBeNull();
    });

    describe('and a target under it', () => {
      it('[UX-19] says how far over the ask the value runs and what is taken at most, announces the ask once, and keeps the target off the control', () => {
        renderWithTheme(<OverTarget />);
        const input = screen.getByLabelText('Service name') as HTMLInputElement;
        expect(descriptionsOf(input)).toEqual(['3 over the 20 asked — 30 at most']);
        expect(announced()).toBe('At the 20 characters asked — 30 at most.');
        expect(input.maxLength).toBe(30);
        expect(input.hasAttribute('target')).toBe(false);

        // Back under the ask, the count runs down to it, not to the limit.
        fireEvent.change(input, { target: { value: 'order-history-read' } });
        expect(descriptionsOf(input)).toEqual(['2 characters left']);
        expect(announced()).toBe('Nearing the 20 characters asked.');
      });

      it('[UX-19] reaches the limit only at the maxLength, and names it as before', () => {
        renderWithTheme(<AtCeiling />);
        expect(descriptionsOf(screen.getByLabelText('Service name'))).toEqual([
          'Limit reached — 30 characters at most.',
        ]);
        expect(announced()).toBe('Limit of 30 characters reached.');
      });
    });
  });

  it('has no announcer without a maxLength', () => {
    renderWithTheme(<Default />);
    expect(announcer()).toBeNull();
  });
});
