import {
  composeFieldGoal,
  DOCUMENT_MEMORY_LEGEND,
  FIELD_ANSWER_PIPELINE_ID,
  FIELD_EVIDENCE_HEADING,
  GoalBudgetExceeded,
  MISSION_FIXTURE,
  renderDocumentGoal,
  resumeChunk,
  splitFieldGoal,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { readIndex } from './input';
import { ANSWERING_PROSE, fieldGoal, sampleEvidence, sampleFields } from './testing';

describe('the field-answer input codec', () => {
  it('[QL-39] a composed goal round-trips: the index read back is the fields and the evidence aliases the composer wrote', () => {
    const goal = fieldGoal();
    expect(goal.startsWith(ANSWERING_PROSE)).toBe(true);
    expect(goal).toContain(
      '- e1 · textbox "Years of experience with Python" · type number · required · at most 3 characters · context "Whole years, professional only."',
    );
    expect(goal).toContain(`${FIELD_EVIDENCE_HEADING}\n\nKinds: profile_fact — `);
    expect(goal).toContain('\n\n- [m1] profile_fact · subject — Alex Example has six years');
    expect(readIndex(goal)).toEqual({
      pipeline: 'field-answer',
      fields: sampleFields(),
      evidence: [{ alias: 'm1' }, { alias: 'm2' }],
    });
  });

  it('[QL-39] the session’s goal splits back into prose and fields, and recomposes with evidence to the same goal every time', () => {
    const bare = fieldGoal([]);
    expect(bare).toContain('(none recalled');
    expect(readIndex(bare)?.evidence).toEqual([]);
    const split = splitFieldGoal(bare);
    expect(split).toEqual({
      pipeline: FIELD_ANSWER_PIPELINE_ID,
      prose: ANSWERING_PROSE,
      fields: sampleFields(),
    });
    if (split === null) throw new Error('the composed goal must split');
    const recomposed = composeFieldGoal({
      ...split,
      evidence: sampleEvidence(),
      kinds: DOCUMENT_MEMORY_LEGEND,
    });
    expect(recomposed).toBe(fieldGoal());
    // Splitting the recomposed goal gives the same prose and fields: the operation is idempotent.
    expect(splitFieldGoal(recomposed)).toEqual(split);
  });

  it('[QL-39] another codec’s goal, a plain policy or a broken fence reads as no index', () => {
    expect(readIndex(renderDocumentGoal(resumeChunk()))).toBeNull();
    expect(readIndex(MISSION_FIXTURE)).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
    expect(splitFieldGoal(renderDocumentGoal(resumeChunk()))).toBeNull();
  });

  it('[QL-39] a goal past the budget is refused rather than clipped', () => {
    expect(() =>
      composeFieldGoal(
        {
          pipeline: FIELD_ANSWER_PIPELINE_ID,
          prose: ANSWERING_PROSE,
          fields: sampleFields(),
          evidence: sampleEvidence(),
          kinds: DOCUMENT_MEMORY_LEGEND,
        },
        500,
      ),
    ).toThrow(GoalBudgetExceeded);
  });
});
