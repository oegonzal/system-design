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
    // The operator is asked at the terminal and through the notifications service.
    expect(shipped.sources.operator).toMatch(/config\/operator\/terminal-and-notifications\.json$/);
    expect(Object.keys(shipped.operator.channels)).toEqual(['notifications']);
    // [BRW-16] What the session types without asking is a total table over the kinds a value may rest on.
    expect(shipped.sources.answering).toMatch(/config\/answering\/standard\.json$/);
    expect(shipped.answering.fills).toEqual({
      stated: 'fill',
      restated: 'fill',
      derived: 'fill',
      mapped: 'fill',
      inferred: 'fill',
      composed: 'fill',
      policy: 'fill',
      none: 'ask',
    });
    // [BRW-18] The record's own suggestion is typed; a draft is offered.
    expect(shipped.answering.drafts).toEqual({
      record: 'fill',
      transfer: 'offer',
      invented: 'offer',
    });
    // One window per service the session rides out, all three declared on the session.
    expect(Object.keys(shipped.session)).toEqual([
      'headed',
      'rails',
      'loopRecovery',
      'advisorRecovery',
      'busRecovery',
    ]);
    expect(shipped.session.busRecovery).toEqual({ windowMs: 60000, pauseMs: 2000 });

    // Every file a choice could name is a complete, valid configuration of its kind.
    expect(profiles('capture').sort()).toEqual(['every-action', 'field-entries', 'observations']);
    expect(profiles('operator').sort()).toEqual(['terminal', 'terminal-and-notifications']);
    expect(profiles('answering')).toEqual(['standard']);
    for (const capture of profiles('capture')) {
      for (const session of profiles('session')) {
        for (const operator of profiles('operator')) {
          for (const answering of profiles('answering')) {
            expect(() =>
              readSessionSettings(
                PACKAGE_ROOT,
                choosing({ capture, session, operator, answering }),
              ),
            ).not.toThrow();
          }
        }
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
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          { 'capture/field-entries.json': '{"after":["fill"],"failures":true,"fullPage":true}' },
        ),
      ),
    ).toThrow(EngineConfigError);
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
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
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          { 'session/standard.json': JSON.stringify(overTarget) },
        ),
      ),
    ).toThrow(/rails\.targetDone: is above maxTasks/);
    // A channel the session cannot build is refused by name.
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          { 'operator/terminal.json': '{"expiresAfterMs":1000,"channels":{"carrier-pigeon":{}}}' },
        ),
      ),
    ).toThrow(EngineConfigError);
    // A channel's own recovery window is a field no schema declares: the session's one bus window serves it.
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          {
            'operator/terminal.json':
              '{"expiresAfterMs":1000,"asksAfterRefusal":1,"channels":{"notifications":{"pullWaitMs":1000,"eventsPerPull":5,"recovery":{"windowMs":1,"pauseMs":1}}}}',
          },
        ),
      ),
    ).toThrow(EngineConfigError);
  });
});
