import { elementByRef, type ObservedElement } from './observation.schema';
import type { StepAction } from './step-plan.schema';

/**
 * An action as the page would recognise it again: its kind, the element it
 * acted on by role and name — a ref is minted per read and names nothing a
 * step later — and what it carried. The identity the exact-repeat rule
 * compares: on a page the last plan left unchanged, an action equal in all
 * four is the same question asked of the same page, and the page has
 * answered it already. Measured 2026-10-08: nine of a session's 31 steps were
 * one click on one already-selected card, repeated.
 */
export interface RanAction {
  kind: StepAction['kind'];
  role: string | null;
  name: string | null;
  detail: string | null;
}

type Named = Pick<ObservedElement, 'ref' | 'role' | 'name'>;

/** What an action carries besides its element: the text typed, the option chosen, the document put in, the key pressed, the URL opened. */
export function actionDetail(action: StepAction): string | null {
  switch (action.kind) {
    case 'fill':
      return action.value;
    case 'select':
      return action.option;
    case 'upload':
      return action.document;
    case 'press':
      return action.key;
    case 'navigate':
      return action.url;
    default:
      return null;
  }
}

/**
 * The identity of an action that ran, or null for one the page is never asked
 * about twice: a wait, a scroll, a screenshot, a question to the answerer, a
 * unit event — repeating any of those is the session's own business.
 */
export function ranActionOf(action: StepAction, elements: readonly Named[]): RanAction | null {
  switch (action.kind) {
    case 'click':
    case 'fill':
    case 'select':
    case 'upload': {
      const element = elementByRef(elements, action.ref);
      return {
        kind: action.kind,
        role: element?.role ?? null,
        name: element?.name ?? null,
        detail: actionDetail(action),
      };
    }
    case 'press':
    case 'navigate':
      return { kind: action.kind, role: null, name: null, detail: actionDetail(action) };
    default:
      return null;
  }
}

/** The ref this observation gives an action that ran — the element of the same role and name — or null when it lists none, or the action named none. */
export function refNowOf(ran: RanAction, elements: readonly Named[]): string | null {
  if (ran.role === null) return null;
  return (
    elements.find((candidate) => candidate.role === ran.role && candidate.name === ran.name)?.ref ??
    null
  );
}
