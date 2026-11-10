import type { NestExpressApplication } from '@nestjs/platform-express';
import { describe, expect, it, vi } from 'vitest';

import { configureBodyLimit, JSON_BODY_LIMIT } from './body';

const fakeApp = () => {
  const useBodyParser = vi.fn();
  return { app: { useBodyParser } as unknown as NestExpressApplication, useBodyParser };
};

describe('configureBodyLimit', () => {
  it('registers the JSON parser with the declared limit and hands the app back', () => {
    const { app, useBodyParser } = fakeApp();
    expect(configureBodyLimit(app)).toBe(app);
    expect(useBodyParser).toHaveBeenCalledWith('json', { limit: JSON_BODY_LIMIT });
    expect(JSON_BODY_LIMIT).toBe('1mb');
  });

  it('takes a limit of the caller’s own', () => {
    const { app, useBodyParser } = fakeApp();
    configureBodyLimit(app, '2mb');
    expect(useBodyParser).toHaveBeenCalledWith('json', { limit: '2mb' });
  });
});
