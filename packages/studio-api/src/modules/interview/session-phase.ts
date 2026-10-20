import type { PhaseAdvance, PracticeFormat, TranscriptPhase } from '@sysdesign/contracts';

/** The session's clock as the entity holds it. */
export interface PhaseState {
  phase: string | null;
  phaseStartedAt: Date | null;
  phaseLog: TranscriptPhase[];
}

/** The clock at the start of a session: the format's first phase, or nothing for a format without one. */
export function startPhases(format: PracticeFormat, now: Date): PhaseState {
  const first = format.phases[0];
  if (first === undefined) return { phase: null, phaseStartedAt: null, phaseLog: [] };
  return {
    phase: first.id,
    phaseStartedAt: now,
    phaseLog: [{ id: first.id, startedAt: now.toISOString(), endedAt: null }],
  };
}

/**
 * The clock after an event: when the current phase declares it as what ends
 * it, that phase's log entry is closed and the next phase, if any, begins.
 * Any other event leaves the clock as it is — a phase ends only on its own
 * declared event, and never on time: a phase run over is recorded, not cut.
 */
export function advancePhase(
  state: PhaseState,
  format: PracticeFormat,
  event: PhaseAdvance,
  now: Date,
): PhaseState {
  const position = format.phases.findIndex((phase) => phase.id === state.phase);
  const current = format.phases[position];
  if (current === undefined || current.advanceOn !== event) return state;
  const at = now.toISOString();
  const closed = state.phaseLog.map((entry, index) =>
    index === state.phaseLog.length - 1 && entry.endedAt === null
      ? { ...entry, endedAt: at }
      : entry,
  );
  const next = format.phases[position + 1];
  if (next === undefined) return { ...state, phaseLog: closed };
  return {
    phase: next.id,
    phaseStartedAt: now,
    phaseLog: [...closed, { id: next.id, startedAt: at, endedAt: null }],
  };
}
