import type { ActiveScope, ObservedElement } from '@sysdesign/contracts';

/**
 * The scope a snapshot keeps whole when it has to be cut: the modal dialog in
 * front, else the last dialog an element sits in, modal or not. A dialog that
 * does not block the page never becomes the active scope — the elements
 * behind it stay in reach — but it is what the page is saying now. Measured
 * 2026-10-10: the dialog confirming an application was sent carried no
 * aria-modal, sat last in a 696-line snapshot, and was the part the goal's cut
 * dropped, so planner and judges read the outcome from the pane alone.
 */
export function snapshotScopeOf(
  activeScope: ActiveScope | null,
  elements: readonly ObservedElement[],
): ActiveScope | null {
  if (activeScope !== null) return activeScope;
  const dialogs = elements.flatMap((element) =>
    element.scope === null ? [] : [{ role: element.scope.role, name: element.scope.name }],
  );
  return dialogs[dialogs.length - 1] ?? null;
}
