import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRACTICE_FORMAT,
  PRACTICE_FORMAT_IDS,
  PRACTICE_FORMATS,
  practiceFormatForKind,
} from './practice-formats';
import { CANVAS_CRITERION_KINDS } from './studio-pipelines';

describe('the practice formats', () => {
  it('[UX-27] a format with an interviewer declares its phases, each advanced by a declared event, and reveals by section; every other format shows everything and has no clock', () => {
    for (const id of PRACTICE_FORMAT_IDS) {
      const format = PRACTICE_FORMATS[id];
      const phaseIds = format.phases.map((phase) => phase.id);
      expect(new Set(phaseIds).size).toBe(phaseIds.length);
      for (const phase of format.phases) expect(phase.minutes).toBeGreaterThan(0);
      if (format.phases.length === 0) {
        expect(format).toMatchObject({ reveal: 'whole', rubric: 'shown', probes: 0 });
      } else {
        expect(format).toMatchObject({ reveal: 'first-section', rubric: 'disclosed' });
        expect(format.probes).toBeGreaterThan(0);
        // The last phase ends on the submit, so a session's clock closes with its design.
        expect(format.phases.at(-1)?.advanceOn).toBe('submit');
      }
    }
    expect(PRACTICE_FORMATS.interview.phases.map((phase) => phase.id)).toEqual([
      'clarify',
      'design',
      'deep-dive',
    ]);
  });
});

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
