import { readFileSync } from 'node:fs';

import { memoryPolicySchema } from '@sysdesign/agentic-memory';

import { AgenticSystemConfigError, PACKAGE_ROOT } from './config';
import { readSettings } from './settings';

/** The package's own files, but an engine.json that chooses only what a spec names. */
const choosing =
  (choices: Record<string, string>) =>
  (at: string): string =>
    at.endsWith('engine.json') ? JSON.stringify(choices) : readFileSync(at, 'utf8');

describe('the service settings', () => {
  it('[AGS-5] reads the shipped design settings from the package config', () => {
    const settings = readSettings(`${__dirname}/..`);
    expect(settings.design).toMatchObject({
      pipeline: 'memory-architecture',
      orchestrator: 'memory-design',
      recall: true,
    });
    expect(settings.sources.design).toMatch(/config\/design\/standard\.json$/);
  });

  it('[AGS-5] reads the shipped memory settings: a policy, the sweep schedule beside it, and the name it was chosen by', () => {
    const settings = readSettings(PACKAGE_ROOT);
    expect(settings.memory).toMatchObject({
      scopeKeys: ['tenant', 'project', 'user'],
      terms: { short_term: { ttlSeconds: 3600 }, long_term: { ttlSeconds: null } },
      sweep: { everyMs: 60_000 },
    });
    expect(settings.policySource).toBe('memory/standard');
    expect(settings.sources.memory).toMatch(/config\/memory\/standard\.json$/);
    // Without the sweep, which is the process's own, the settings are a policy a space can snapshot.
    const { sweep, ...policy } = settings.memory;
    expect(memoryPolicySchema.safeParse(policy).success).toBe(true);
    expect(memoryPolicySchema.safeParse(settings.memory).success).toBe(false);
  });

  it('[AGS-5] refuses a root whose engine.json leaves a kind unchosen, by its name', () => {
    expect(() => readSettings(PACKAGE_ROOT, choosing({ memory: 'standard' }))).toThrow(
      /chooses no design/,
    );
    expect(() => readSettings(PACKAGE_ROOT, choosing({ design: 'standard' }))).toThrow(
      /chooses no memory/,
    );
    expect(() => readSettings(PACKAGE_ROOT, choosing({}))).toThrow(AgenticSystemConfigError);
  });
});
