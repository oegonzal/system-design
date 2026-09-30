import { describe, expect, it } from 'vitest';

import { tinyPipeline } from '../testing';
import { createSchemaValidator } from './schema-validator';

const contract = { ...tinyPipeline().task, goal: 'g', criteria: [] };

describe('createSchemaValidator', () => {
  it('[QL-3] blocks an artifact that is not the declared shape, naming each path', () => {
    const report = createSchemaValidator().validate({ text: 1, extra: true }, contract);
    expect(report.gate).toBe('block');
    expect(report.problems.map((problem) => problem.message)).toEqual([
      expect.stringMatching(/^text: /),
      expect.stringMatching(/^parts: /),
      expect.stringMatching(/^\$: /),
    ]);
    expect(createSchemaValidator().validate({ text: 't', parts: [] }, contract).problems).toEqual(
      [],
    );
  });
});
