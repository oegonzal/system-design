import { PRACTICE_FORMATS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { advancePhase, startPhases } from './session-phase';

const T0 = new Date('2026-10-20T10:00:00.000Z');
const T1 = new Date('2026-10-20T10:12:00.000Z');
const T2 = new Date('2026-10-20T10:50:00.000Z');

describe('the session clock', () => {
  it('[UX-27] starts in the format’s first phase, or nowhere for a format without phases', () => {
    expect(startPhases(PRACTICE_FORMATS.interview, T0)).toEqual({
      phase: 'clarify',
      phaseStartedAt: T0,
      phaseLog: [{ id: 'clarify', startedAt: T0.toISOString(), endedAt: null }],
    });
    expect(startPhases(PRACTICE_FORMATS.system, T0)).toEqual({
      phase: null,
      phaseStartedAt: null,
      phaseLog: [],
    });
  });

  it('[UX-27] a phase ends only on its declared event — never on time — and the last closes on the submit', () => {
    const format = PRACTICE_FORMATS.interview;
    const clarify = startPhases(format, T0);
    // Over its ten minutes, and still the same phase: nothing is forced.
    expect(advancePhase(clarify, format, 'probe', T1)).toEqual(clarify);
    expect(advancePhase(clarify, format, 'submit', T1)).toEqual(clarify);
    const design = advancePhase(clarify, format, 'advance', T1);
    expect(design).toEqual({
      phase: 'design',
      phaseStartedAt: T1,
      phaseLog: [
        { id: 'clarify', startedAt: T0.toISOString(), endedAt: T1.toISOString() },
        { id: 'design', startedAt: T1.toISOString(), endedAt: null },
      ],
    });
    const deepDive = advancePhase(design, format, 'probe', T2);
    expect(deepDive.phase).toBe('deep-dive');
    const done = advancePhase(deepDive, format, 'submit', T2);
    expect(done.phase).toBe('deep-dive');
    expect(done.phaseLog.at(-1)).toEqual({
      id: 'deep-dive',
      startedAt: T2.toISOString(),
      endedAt: T2.toISOString(),
    });
    // A clock with no phase takes no event.
    expect(
      advancePhase(startPhases(PRACTICE_FORMATS.system, T0), format, 'advance', T1).phase,
    ).toBe(null);
  });
});
