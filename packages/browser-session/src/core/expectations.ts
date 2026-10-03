import type { PageObservation } from '@sysdesign/contracts';

import type { BrowserAction } from './ports';

/**
 * What the last executed action promised about the next page, in two halves.
 * The brain's word is the action's own `expect` — free text the history
 * carries beside the action, which the next plan reads and judges for
 * itself. The engine's word is an exact check derived from the action's
 * structured fields alone: where a navigation said it was going, what a
 * wait said it waited for. No prose is ever parsed here; a check the engine
 * cannot state exactly is not a check, and only an exact check that fails
 * counts as a failed step.
 */
export type ExactCheck =
  | { kind: 'url-prefix'; value: string }
  | { kind: 'url-contains'; value: string }
  | { kind: 'element'; role: string; name: string };

export interface PendingExpectation {
  /** The action as the history describes it. */
  action: string;
  /** The brain's own expectation, or null when it stated none. */
  expect: string | null;
  check: ExactCheck | null;
}

const elementCheck = (ref: string, observation: PageObservation): ExactCheck | null => {
  const element = observation.elements.find((candidate) => candidate.ref === ref);
  return element === undefined ? null : { kind: 'element', role: element.role, name: element.name };
};

/** The exact check an action's structured fields state; null for an action that promises nothing checkable. */
export function exactCheckOf(
  action: BrowserAction,
  observation: PageObservation,
): ExactCheck | null {
  switch (action.kind) {
    case 'navigate':
      return { kind: 'url-prefix', value: action.url };
    case 'waitFor':
      if (action.until === 'url') return { kind: 'url-contains', value: action.value };
      if (action.until === 'element') return elementCheck(action.value, observation);
      return null;
    default:
      return null;
  }
}

/** Whether the next observation bears the check out. */
export function checkExact(check: ExactCheck, observation: PageObservation): boolean {
  switch (check.kind) {
    case 'url-prefix':
      return observation.url.startsWith(check.value);
    case 'url-contains':
      return observation.url.includes(check.value);
    case 'element':
      return observation.elements.some(
        (element) => element.role === check.role && element.name === check.name,
      );
  }
}

/** What the history says when the exact check failed: the check in words, and what the brain had expected. */
export function unmetNote(pending: PendingExpectation): string {
  const check = pending.check === null ? 'what was expected' : describeCheck(pending.check);
  const expected =
    pending.expect === null || pending.expect === '' ? '' : ` — expected: ${pending.expect}`;
  return `the next page did not show ${check}${expected}`;
}

const describeCheck = (check: ExactCheck): string =>
  check.kind === 'element'
    ? `${check.role} "${check.name}"`
    : `a URL ${check.kind === 'url-prefix' ? 'starting with' : 'containing'} ${check.value}`;
