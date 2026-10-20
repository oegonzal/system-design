import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRACTICE_FORMAT,
  PRACTICE_FORMAT_IDS,
  PRACTICE_FORMATS,
  practiceFormatForKind,
} from './practice-formats';
import { CANVAS_CRITERION_KINDS } from './studio-pipelines';

describe('practiceFormatForKind', () => {
  it('[UX-30] is the first declared format whose emphasis names the kind, and the default for a kind no format emphasises', () => {
    for (const kind of CANVAS_CRITERION_KINDS) {
      const format = practiceFormatForKind(kind);
      const emphasised = PRACTICE_FORMAT_IDS.filter((id) =>
        (PRACTICE_FORMATS[id].emphasis as readonly string[]).includes(kind),
      );
      expect(format).toBe(emphasised[0] ?? DEFAULT_PRACTICE_FORMAT);
    }
    expect(practiceFormatForKind('domain_model')).toBe('system');
    expect(practiceFormatForKind('workflow')).toBe('workflow');
    expect(practiceFormatForKind('evolution')).toBe('evolution');
    expect(practiceFormatForKind('constraint')).toBe(DEFAULT_PRACTICE_FORMAT);
  });
});
