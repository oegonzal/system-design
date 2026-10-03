import { bound, bounded } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { tinyPipeline } from '../testing';
import { createBoundsValidator, createSchemaValidator } from './schema-validator';

const tiny = tinyPipeline().task;
const contract = { ...tiny, goal: 'g', criteria: [] };

/** The tiny task with its text declared at a target of 20 characters (ceiling 60). */
const boundedContract = {
  ...contract,
  output: {
    ...tiny.output,
    schema: z.strictObject({ text: bounded.text(bound(20)), parts: z.array(z.string()) }),
  },
};

describe('createSchemaValidator', () => {
  it('[QL-3] blocks an artifact that is not the declared shape, naming each path', () => {
    const report = createSchemaValidator().validate({ text: 1, extra: true }, contract);
    expect(report.gate).toBe('block');
    expect(report.problems.map((problem) => [problem.severity, problem.message])).toEqual([
      ['critical', expect.stringMatching(/^text: /)],
      ['critical', expect.stringMatching(/^parts: /)],
      // A key it would have stripped is named beside the faults, and never refused on its own.
      ['info', expect.stringMatching(/^\(root\): .* — noted, not refused$/)],
    ]);
    expect(createSchemaValidator().validate({ text: 't', parts: [] }, contract).problems).toEqual(
      [],
    );
  });

  it('[QL-47] a field past its size is no fault of the shape: the artifact passes, kept whole', () => {
    const long = 'word '.repeat(30).trim();
    expect(long.length).toBeGreaterThan(60);
    const report = createSchemaValidator().validate({ text: long, parts: [] }, boundedContract);
    expect(report.problems).toEqual([]);
  });
});

describe('createBoundsValidator', () => {
  it('[QL-47] warns once per field past its target, in the one wording, and blocks nothing', () => {
    const validator = createBoundsValidator();
    expect(validator.gate).toBe('warn');
    const report = validator.validate({ text: 'x'.repeat(25), parts: [] }, boundedContract);
    expect(report).toEqual({
      validatorId: 'bounds',
      gate: 'warn',
      problems: [
        {
          severity: 'info',
          locationRefs: [],
          message: 'text: 25 characters; 20 asked, 60 accepted — noted, not refused',
        },
      ],
    });
    // Within the target, or malformed (the schema validator's to report), there is nothing to say.
    expect(validator.validate({ text: 'short', parts: [] }, boundedContract).problems).toEqual([]);
    expect(validator.validate({ text: 1 }, boundedContract).problems).toEqual([]);
  });
});
