import { describe, expect, it } from 'vitest';

import { formTargetReportSchema } from '../browser-session/pipelines';
import { ADMISSIONS, runReadoutSchema } from './admission';
import { WITHHOLDING_SOURCES } from './pipeline';

describe('runReadoutSchema', () => {
  it('[QL-83] reads a settled run’s readout — any admission, each withheld location with what withheld it — and refuses more or other', () => {
    for (const admission of ADMISSIONS) {
      expect(runReadoutSchema.parse({ admission, withheld: [] })).toEqual({
        admission,
        withheld: [],
      });
    }
    const withheld = WITHHOLDING_SOURCES.map((source, position) => ({
      ref: `field.${position + 1}`,
      source,
      by: `by-${source}`,
      note: position === 0 ? 'in the judge’s words' : null,
    }));
    expect(runReadoutSchema.parse({ admission: 'fell-short', withheld })).toEqual({
      admission: 'fell-short',
      withheld,
    });
    expect(runReadoutSchema.safeParse({ admission: 'accepted', withheld: [] }).success).toBe(false);
    expect(
      runReadoutSchema.safeParse({ admission: 'admitted', withheld: [], overall: 90 }).success,
    ).toBe(false);
    expect(
      runReadoutSchema.safeParse({
        admission: 'admitted',
        withheld: [{ ref: 'field.1', source: 'judge', by: 'x', note: null }],
      }).success,
    ).toBe(false);
    // The form-memory target step reports under the very shape the run answers on its read.
    expect(formTargetReportSchema).toBe(runReadoutSchema);
  });
});
