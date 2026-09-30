import { describe, expect, it } from 'vitest';

import { narrationSlotState } from './narration-draft';

const PROSE =
  'The Orders DB persists every order and owns the write path. ' +
  'It is the source of truth that reads reconcile against.';

describe('narrationSlotState', () => {
  it('knows written from unwritten and nothing more — substance is the critic’s call', () => {
    expect(narrationSlotState('   ')).toBe('empty');
    expect(narrationSlotState('too short')).toBe('filled');
    expect(narrationSlotState(PROSE)).toBe('filled');
  });
});
