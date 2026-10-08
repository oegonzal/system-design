import { describe, expect, it } from 'vitest';

import { actionDetail, ranActionOf, refNowOf } from './action-identity';
import { listingObservation } from './fixtures';
import type { StepAction } from './step-plan.schema';

const common = { reason: 'r', expect: null, serves: [] };

describe('the identity of an action that ran', () => {
  it('[BRW-1] names the element by role and name, never by ref, and carries what the action carried', () => {
    const { elements } = listingObservation();
    const click: StepAction = { kind: 'click', ref: 'e3', ...common };
    expect(ranActionOf(click, elements)).toEqual({
      kind: 'click',
      role: 'link',
      name: 'Senior Engineer — Acme',
      detail: null,
    });
    const fill: StepAction = { kind: 'fill', ref: 'e1', value: 'engineer', ...common };
    expect(ranActionOf(fill, elements)).toEqual({
      kind: 'fill',
      role: 'searchbox',
      name: 'Search by title',
      detail: 'engineer',
    });
    expect(ranActionOf({ kind: 'press', key: 'Enter', ...common }, elements)).toEqual({
      kind: 'press',
      role: null,
      name: null,
      detail: 'Enter',
    });
    expect(ranActionOf({ kind: 'navigate', url: 'https://x.test/', ...common }, elements)).toEqual({
      kind: 'navigate',
      role: null,
      name: null,
      detail: 'https://x.test/',
    });
    // A ref the page no longer lists leaves the element unnamed, never a guess.
    expect(ranActionOf({ kind: 'click', ref: 'e99', ...common }, elements)).toEqual({
      kind: 'click',
      role: null,
      name: null,
      detail: null,
    });
    expect(actionDetail({ kind: 'select', ref: 'e2', option: 'Yes', ...common })).toBe('Yes');
  });

  it('[BRW-1] a wait, a scroll, a question or a unit event has no identity to repeat', () => {
    const { elements } = listingObservation();
    for (const action of [
      { kind: 'waitFor', until: 'element', value: 'e3', ...common },
      { kind: 'scroll', direction: 'down', ref: null, ...common },
      { kind: 'askFields', refs: ['e1'], ...common },
      { kind: 'taskStart', label: 'x', url: 'https://x.test/', ...common },
      { kind: 'done', ...common },
    ] as StepAction[]) {
      expect(ranActionOf(action, elements)).toBeNull();
    }
  });

  it('[BRW-1] finds the ref this observation gives a ran action by role and name, or none', () => {
    const { elements } = listingObservation();
    const reminted = elements.map((element, index) => ({ ...element, ref: `f1e${index + 1}` }));
    const ran = ranActionOf({ kind: 'click', ref: 'e4', ...common }, elements);
    expect(ran).not.toBeNull();
    if (ran === null) return;
    expect(refNowOf(ran, reminted)).toBe('f1e4');
    expect(refNowOf(ran, reminted.slice(0, 2))).toBeNull();
    expect(
      refNowOf({ kind: 'press', role: null, name: null, detail: 'Enter' }, reminted),
    ).toBeNull();
  });
});
