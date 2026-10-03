import { BadRequestException } from '@nestjs/common';
import { bound, bounded, type ApiValidationIssue } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod.pipe';

/** The 400's issues, as a client reads them. */
function refusedWith(run: () => unknown): ApiValidationIssue[] {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { issues: ApiValidationIssue[] })
      .issues;
  }
  throw new Error('the pipe accepted the value');
}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.strictObject({ limit: z.number().int().min(1) }));

  it('returns the parsed value', () => {
    expect(pipe.transform({ limit: 3 })).toEqual({ limit: 3 });
  });

  it('answers 400 with one issue per offending path', () => {
    expect(() => pipe.transform({ limit: 0, extra: true })).toThrow(BadRequestException);
    const issues = refusedWith(() => pipe.transform({ limit: 0, extra: true }));
    expect(issues.map((issue) => issue.path).sort()).toEqual(['', 'limit']);
    expect(issues.every((issue) => typeof issue.message === 'string')).toBe(true);
  });

  describe('lenient', () => {
    const CLAIM = bound(60);
    const schema = z.strictObject({
      kind: z.enum(['sync', 'async']),
      claims: bounded.list(bound(2, 'list'), bounded.text(CLAIM, { min: 1 })),
    });
    const strict = new ZodValidationPipe(schema);
    const lenient = new ZodValidationPipe(schema, { lenient: true });
    // Past the ceiling, not just the ask — sixty asked, a hundred accepted — and
    // short of the three asks past which the ladder cuts.
    const long = `${'a claim well past the ceiling, '.repeat(4)}written out at length`;

    it('keeps text past a bound’s ceiling whole where the strict pipe refuses it', () => {
      expect(refusedWith(() => strict.transform({ kind: 'sync', claims: [long] }))).toEqual([
        { path: 'claims.0', message: expect.stringContaining('100') },
      ]);
      expect(lenient.transform({ kind: 'sync', claims: [long] })).toEqual({
        kind: 'sync',
        claims: [long],
      });
    });

    it('strips an unknown key and trims a list past its ceiling by whole items', () => {
      expect(
        lenient.transform({ kind: 'async', claims: ['a', 'b', 'c', 'd', 'e'], aside: 1 }),
      ).toEqual({ kind: 'async', claims: ['a', 'b', 'c', 'd'] });
    });

    it('[UX-20] still answers 400 for a structural fault, in the same issue shape, naming only what refused', () => {
      const issues = refusedWith(() => lenient.transform({ kind: 'teapot', claims: [long, ''] }));
      expect(issues).toEqual([
        { path: 'kind', message: expect.any(String) },
        { path: 'claims.1', message: expect.any(String) },
      ]);
    });
  });
});
