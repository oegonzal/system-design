import { actionRefs, fieldLabelOf, type PageObservation, elementByRef } from '@sysdesign/contracts';

import type { EngineContext } from './engine-context';
import type { BrowserAction, BrowserActionKind } from './ports';
import { captureFileName, captureFiles, type CaptureRecord } from './session-dump';

/**
 * Images of what a session did, beside the page each step read: the actions
 * its capture policy names, once they ran, and — when it says so — one the
 * page refused, as the page stood. A field entry is outlined in its image, so
 * the image documents which field took the value; any other action is not,
 * its element being the page's to keep or replace. A capture never fails an
 * action or the session: an image that could not be taken is a warning.
 */

/** The actions that put a value into a field — a file into a file control among them: their element stays where it was, so its image can mark it. */
const ENTRY_KINDS: readonly BrowserActionKind[] = ['fill', 'select', 'upload'];

/** What an action touched, by the name the page gives it — never a value it entered. */
export function touchedName(action: BrowserAction, observation: PageObservation): string | null {
  const [ref] = actionRefs(action);
  if (ref === undefined) return action.kind === 'press' ? action.key : null;
  const element = elementByRef(observation.elements, ref);
  return element === undefined ? null : (fieldLabelOf(element) ?? element.role);
}

/** The image the policy asks for after an action, into the step's dump and its `captures.json`. */
export async function captureAfter(
  ctx: EngineContext,
  action: BrowserAction,
  described: { label: string; touched: string | null },
  outcome: CaptureRecord['outcome'],
): Promise<void> {
  const { capture } = ctx.options;
  // An action that ran is imaged when the policy names its kind; one the page refused, when it asks for refusals.
  const wanted = outcome === 'ok' ? capture.after.includes(action.kind) : capture.failures;
  if (!wanted) return;
  const { deps, state } = ctx;
  const outline = ENTRY_KINDS.includes(action.kind) ? (actionRefs(action)[0] ?? null) : null;
  let bytes: Uint8Array;
  try {
    bytes = await deps.browser.screenshot(outline);
  } catch (error) {
    deps.warn(`step ${state.step}: ${action.kind} not captured: ${String(error)}`);
    return;
  }
  const ordinal = state.captures.length + 1;
  const record: CaptureRecord = {
    ordinal,
    file: captureFileName(ordinal, action.kind, described.touched),
    kind: action.kind,
    label: described.label,
    outcome,
    at: deps.clock.now().toISOString(),
  };
  state.captures.push(record);
  ctx.dumpFiles('capture', captureFiles(state.step, record, bytes, [...state.captures]));
}
