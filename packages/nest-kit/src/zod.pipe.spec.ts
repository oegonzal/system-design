import { BadRequestException } from '@nestjs/common';
import type { ApiValidationIssue } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.strictObject({ limit: z.number().int().min(1) }));

  it('returns the parsed value', () => {
    expect(pipe.transform({ limit: 3 })).toEqual({ limit: 3 });
  });

  it('answers 400 with one issue per offending path', () => {
    expect(() => pipe.transform({ limit: 0, extra: true })).toThrow(BadRequestException);
    try {
      pipe.transform({ limit: 0, extra: true });
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        issues: ApiValidationIssue[];
      };
      expect(response.issues.map((issue) => issue.path).sort()).toEqual(['', 'limit']);
      expect(response.issues.every((issue) => typeof issue.message === 'string')).toBe(true);
    }
  });
});
