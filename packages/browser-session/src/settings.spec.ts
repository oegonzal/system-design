import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EngineConfigError } from '@sysdesign/config-kit';

import { PACKAGE_ROOT, SessionConfigError } from './config';
import { readSessionSettings } from './settings';

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

describe('the session settings', () => {
  it('[BRW-7] reads the choices the package ships, and every profile it ships validates', () => {
    const shipped = readSessionSettings(PACKAGE_ROOT);
    expect(shipped.capture).toEqual({ after: ['fill', 'select'], failures: true });
    expect(shipped.session.headed).toBe(true);
    expect(shipped.sources.capture).toMatch(/config\/capture\/field-entries\.json$/);
    expect(shipped.sources.session).toMatch(/config\/session\/standard\.json$/);

    // Every file a choice could name is a complete, valid configuration of its kind.
    expect(profiles('capture').sort()).toEqual(['every-action', 'field-entries', 'observations']);
    for (const capture of profiles('capture')) {
      for (const session of profiles('session')) {
        expect(() =>
          readSessionSettings(PACKAGE_ROOT, choosing({ capture, session })),
        ).not.toThrow();
      }
    }
  });

  it('[BRW-7] refuses by name a kind left unchosen, a field no schema declares, and a target above its budget', () => {
    expect(() => readSessionSettings(PACKAGE_ROOT, choosing({ capture: 'field-entries' }))).toThrow(
      SessionConfigError,
    );
    expect(() => readSessionSettings(PACKAGE_ROOT, choosing({ capture: 'field-entries' }))).toThrow(
      /config\/engine\.json chooses no session: name a file under .*config\/session/,
    );
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard' },
          { 'capture/field-entries.json': '{"after":["fill"],"failures":true,"fullPage":true}' },
        ),
      ),
    ).toThrow(EngineConfigError);
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard' },
          { 'capture/field-entries.json': '{"after":["fill","fill"],"failures":true}' },
        ),
      ),
    ).toThrow(/after: lists a kind twice/);
    const standard = JSON.parse(real(join(CONFIG, 'session', 'standard.json'))) as {
      rails: Record<string, unknown>;
    };
    const overTarget = { ...standard, rails: { ...standard.rails, targetDone: 50, maxTasks: 5 } };
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard' },
          { 'session/standard.json': JSON.stringify(overTarget) },
        ),
      ),
    ).toThrow(/rails\.targetDone: is above maxTasks/);
  });
});
