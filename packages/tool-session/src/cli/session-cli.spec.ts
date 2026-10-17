import { TOOL_MISSION_FIXTURE, type ToolPlan } from '@sysdesign/contracts';

import { SessionRegistry } from '../session';
import { fakeDeps, FakeLoopClient, okTool, sampleSettings } from '../session/testing';
import { EXIT, sessionCli, type CliBoot } from './session-cli';

const listing: ToolPlan = {
  assessment: 'List.',
  calls: [{ tool: 'list_items', argumentsJson: '{}', reason: 'first', expect: null, serves: [] }],
  ask: null,
  finish: null,
};
const finishing: ToolPlan = {
  assessment: 'Done.',
  calls: [],
  ask: null,
  finish: { cause: 'nothing-left', detail: 'all noted' },
};
const refused = {
  artifact: listing,
  finalDecision: 'escalate' as const,
  policyAllowed: false,
  findings: [{ type: 'missed_stop', locationRefs: ['assessment'] }],
};

const booting = (script: ConstructorParameters<typeof FakeLoopClient>[0]) => {
  const closes: string[] = [];
  const boot = (): Promise<CliBoot> =>
    Promise.resolve({
      registry: new SessionRegistry(
        fakeDeps(new FakeLoopClient(script), [okTool('list_items')]),
        'example',
        sampleSettings(),
      ),
      close: () => {
        closes.push('closed');
        return Promise.resolve();
      },
    });
  return { boot, closes };
};

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    read: () => TOOL_MISSION_FIXTURE,
    sleep: () => Promise.resolve(),
    lines: { out, err },
  };
};

describe('the session command line', () => {
  it('[TSS-5] runs a mission from a file to its end, printing each step and the ending, exits 0 when it completed, and closes the program behind it', async () => {
    const { boot, closes } = booting([{ artifact: listing }, { artifact: finishing }]);
    const console = io();
    expect(
      await sessionCli(
        ['run', '--goal', 'mission.md', '--max-steps', '4'],
        'example',
        boot,
        console,
      ),
    ).toBe(EXIT.complete);
    expect(console.lines.out[0]).toMatch(/^session [0-9a-f-]+: Keep the list of items/);
    expect(console.lines.out).toContain('step 1: ran 1 — list_items ok');
    expect(console.lines.out).toContain('step 2: ran 0 — finish nothing-left');
    expect(console.lines.out.at(-1)).toBe('complete: nothing-left — all noted');
    expect(closes).toEqual(['closed']);
  });

  it('[TSS-5] exits 1 for a session stopped by a rail, and 2 for a usage it cannot read without booting', async () => {
    const stalled = booting([refused, refused]);
    const console = io();
    expect(
      await sessionCli(['run', '--goal', 'mission.md'], 'example', stalled.boot, console),
    ).toBe(EXIT.notComplete);
    expect(console.lines.out.at(-1)).toMatch(/^stopped: stalled/);

    const booted: string[] = [];
    const never = (): Promise<CliBoot> => {
      booted.push('booted');
      throw new Error('must not boot');
    };
    for (const argv of [
      [],
      ['run'],
      ['run', '--goal'],
      ['run', '--goal', 'm.md', '--max-steps', 'many'],
      ['serve', '--goal', 'm.md'],
    ]) {
      const usage = io();
      expect(await sessionCli(argv, 'example', never, usage)).toBe(EXIT.usage);
      expect(usage.lines.err[0]).toContain('usage: example run --goal');
    }
    const unreadable = io();
    unreadable.read = () => {
      throw new Error('ENOENT');
    };
    expect(await sessionCli(['run', '--goal', 'missing.md'], 'example', never, unreadable)).toBe(
      EXIT.usage,
    );
    expect(booted).toEqual([]);
  });
});
