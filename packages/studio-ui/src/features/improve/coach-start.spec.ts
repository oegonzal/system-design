import { describeUnassessedBase } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { coachStart } from './coach-start';

const revision = { id: 'rev-2', revisionNumber: 2 } as const;

describe('coachStart', () => {
  it('[DEL-3] hands an unedited revision with a verdict over as it is, and submits anything else first', () => {
    expect(coachStart({ ...revision, standing: 'complete' })).toEqual({
      from: 'revision',
      revisionId: 'rev-2',
      revisionNumber: 2,
    });
    expect(coachStart(null)).toEqual({ from: 'draft' });
    // No grade to adopt: the coach's first iteration grades it.
    expect(coachStart({ ...revision, standing: 'failed' })).toEqual({ from: 'draft' });
    expect(coachStart({ ...revision, standing: 'running' })).toEqual({ from: 'draft' });
    expect(coachStart({ ...revision, standing: null })).toEqual({ from: 'draft' });
  });

  it('[UX-18] refuses an unedited revision whose grade earned no score, in the API’s own words', () => {
    expect(coachStart({ ...revision, standing: 'unscored' })).toEqual({
      from: 'refused',
      reason: describeUnassessedBase(2),
    });
  });
});
