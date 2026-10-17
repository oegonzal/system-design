import { freshCounters, railDetail, railEnding, trippedRail } from './rails';
import { sampleSettings } from './testing';

describe('the rails', () => {
  const { rails } = sampleSettings();

  it('[TSS-3] trips each limit by its declared count, in declared order, and ends the session with the status its table declares', () => {
    expect(trippedRail(freshCounters(), rails, 1, 0)).toBeNull();
    expect(trippedRail(freshCounters(), rails, rails.maxSteps, 0)).toBeNull();
    expect(trippedRail(freshCounters(), rails, rails.maxSteps + 1, 0)).toBe('step-limit');
    expect(trippedRail(freshCounters(), rails, 1, rails.maxMinutes * 60_000 + 1)).toBe(
      'time-limit',
    );
    expect(trippedRail({ ...freshCounters(), brainFaults: 2 }, rails, 1, 0)).toBe('loop-faulted');
    expect(trippedRail({ ...freshCounters(), refusals: 2 }, rails, 1, 0)).toBe('stalled');
    expect(trippedRail({ ...freshCounters(), failedCalls: 2 }, rails, 1, 0)).toBe('tools-failing');
    expect(
      railEnding('stalled', railDetail('stalled', { ...freshCounters(), refusals: 2 }, rails)),
    ).toEqual({
      cause: 'stalled',
      detail: '2 plans in a row were refused or ran nothing',
      status: 'stopped',
    });
    expect(railEnding('error', 'x').status).toBe('failed');
  });
});
