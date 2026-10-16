/**
 * What each part of a plan does to the rest of the plan, declared once as a
 * table and read by exactly one rule per cell. A plan's parts are its calls —
 * each of a declared effect — and the two closers, an ask and a finish.
 *
 * - `terminal`: nothing follows it in the plan. An irreversible call's
 *   outcome must be seen before anything is planned past it; an ask's answer
 *   and a finish's end are a person's and the session's to give.
 * - `claims`: nothing precedes it. An ask and a finish claim what the
 *   observations show as they stand, so a call before either would change
 *   what they claim.
 * - `irrevocable`: held to the loop's accept bar by the read-back, since no
 *   next observation can answer it — the one move a later step cannot undo.
 *
 * An approval-gated call is also terminal for its plan, whatever its effect:
 * its outcome is the operator's to give, so what follows it would be planned
 * on an answer nobody has. That rule reads the index's `approval`, not this
 * table.
 */
export const PLAN_PART_KINDS = ['read', 'write', 'irreversible', 'ask', 'finish'] as const;
export type PlanPartKind = (typeof PLAN_PART_KINDS)[number];

export interface PartEffects {
  terminal: boolean;
  claims: boolean;
  irrevocable: boolean;
}

export const TOOL_EFFECTS = {
  read: { terminal: false, claims: false, irrevocable: false },
  write: { terminal: false, claims: false, irrevocable: false },
  irreversible: { terminal: true, claims: false, irrevocable: true },
  ask: { terminal: true, claims: true, irrevocable: false },
  finish: { terminal: true, claims: true, irrevocable: true },
} as const satisfies Record<PlanPartKind, PartEffects>;
