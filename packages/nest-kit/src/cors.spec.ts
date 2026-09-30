import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { configureCors } from './cors';

const ORIGIN = { envVar: 'APP_CORS_ORIGIN', defaultOrigin: 'http://localhost:4200' };

const fakeApp = () => {
  const enableCors = vi.fn();
  return { app: { enableCors } as unknown as INestApplication, enableCors };
};

describe('configureCors', () => {
  it('uses the declared default when the env var is unset', () => {
    const { app, enableCors } = fakeApp();
    expect(configureCors(app, ORIGIN, {})).toBe(app);
    expect(enableCors).toHaveBeenCalledWith({ origin: 'http://localhost:4200' });
  });

  it('lets the env var override the default', () => {
    const { app, enableCors } = fakeApp();
    configureCors(app, ORIGIN, { APP_CORS_ORIGIN: 'https://app.example' });
    expect(enableCors).toHaveBeenCalledWith({ origin: 'https://app.example' });
  });
});
