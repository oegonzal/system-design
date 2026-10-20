import { describe, expect, it } from 'vitest';

import type { DesignSubmission } from './canvas.schema';
import { shortLocationLabel, submissionLocations } from './submission-locations';

const submission = (): DesignSubmission => ({
  graph: { nodes: [{ id: 'n-1', kind: 'service', label: 'API' }], edges: [] },
  brief: null,
  narrative: null,
  transcript: {
    version: 1,
    turns: [
      { role: 'candidate', phase: 'clarify', text: 'How fast must reads be?' },
      {
        role: 'interviewer',
        phase: 'clarify',
        text: 'Within 300 ms at p99.',
        disclosesCriterionIds: ['c3'],
      },
    ],
    phases: [{ id: 'clarify', startedAt: '2026-10-20T10:00:00.000Z', endedAt: null }],
  },
});

describe('transcript locations', () => {
  it('[UX-27] every turn is a positional `turn.N` labelled by its role, with no key and no name, after every other part', () => {
    const locations = submissionLocations(submission());
    expect(locations.map((location) => location.id)).toEqual(['node.1', 'turn.1', 'turn.2']);
    expect(locations[1]).toEqual({
      id: 'turn.1',
      label: 'candidate turn',
      part: 'turn',
      key: null,
      name: null,
    });
    expect(shortLocationLabel({ part: 'turn', key: null, label: 'interviewer turn' })).toBe(
      'interviewer turn',
    );
  });

  it('[UX-27] a submission with no transcript lists no turn', () => {
    expect(
      submissionLocations({ ...submission(), transcript: null }).map((location) => location.part),
    ).toEqual(['node']);
  });
});
