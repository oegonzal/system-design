import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EngineConfigError } from '@sysdesign/config-kit';
import { APPLICATION_STATUSES } from '@sysdesign/contracts';

import { JobApplicationConfigError, PACKAGE_ROOT } from './config';
import { readSettings } from './settings';

const CONFIG = join(PACKAGE_ROOT, 'config');
const real = (at: string): string => readFileSync(at, 'utf8');

/** The package's own files, with the choices file replaced — and any file named here replaced too. */
const choosing =
  (choices: Record<string, string>, files: Record<string, string> = {}) =>
  (at: string): string => {
    if (at === join(CONFIG, 'engine.json')) return JSON.stringify(choices);
    const named = Object.entries(files).find(([name]) => at === join(CONFIG, name));
    return named === undefined ? real(at) : named[1];
  };

const profiles = (kind: string): string[] =>
  readdirSync(join(CONFIG, kind))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length));

describe('the service settings', () => {
  it('[JA-8] reads the choices the package ships, every file it ships validates, and the stance map is total', () => {
    const shipped = readSettings(PACKAGE_ROOT);
    expect(shipped.policy.windowDays).toBe(90);
    expect(Object.keys(shipped.policy.stances).sort()).toEqual([...APPLICATION_STATUSES].sort());
    // The owner's decisions: 2026-10-11, a unit in progress elsewhere is forbidden and an application made is avoided;
    // 2026-10-29, one that failed or was set aside is avoided for the window too, so no later session retries it.
    expect(shipped.policy.stances).toMatchObject({
      'in-progress': 'forbid',
      submitted: 'avoid',
      failed: 'avoid',
      skipped: 'avoid',
    });
    expect(shipped.intake.subscription).toBe('job-application.sessions');
    expect(shipped.sources.policy).toMatch(/config\/policy\/scatter\.json$/);
    for (const policy of profiles('policy')) {
      for (const intake of profiles('intake')) {
        expect(() => readSettings(PACKAGE_ROOT, choosing({ policy, intake }))).not.toThrow();
      }
    }
  });

  it('[JA-8] refuses by name a kind left unchosen, a field no schema declares, and a stance map with a status missing', () => {
    expect(() => readSettings(PACKAGE_ROOT, choosing({ policy: 'scatter' }))).toThrow(
      JobApplicationConfigError,
    );
    expect(() => readSettings(PACKAGE_ROOT, choosing({ policy: 'scatter' }))).toThrow(
      /config\/engine\.json chooses no intake: name a file under .*config\/intake/,
    );
    const scatter = JSON.parse(real(join(CONFIG, 'policy', 'scatter.json'))) as {
      stances: Record<string, unknown>;
    };
    const { skipped: _dropped, ...partial } = scatter.stances;
    expect(() =>
      readSettings(
        PACKAGE_ROOT,
        choosing(
          { policy: 'scatter', intake: 'standard' },
          { 'policy/scatter.json': JSON.stringify({ ...scatter, stances: partial }) },
        ),
      ),
    ).toThrow(EngineConfigError);
    expect(() =>
      readSettings(
        PACKAGE_ROOT,
        choosing(
          { policy: 'scatter', intake: 'standard' },
          { 'policy/scatter.json': JSON.stringify({ ...scatter, recallLimit: 200 }) },
        ),
      ),
    ).toThrow(EngineConfigError);
  });
});
