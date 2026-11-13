import { parseOptions, USAGE } from './cli';
import { DEFAULTS, launchOf, parsed, STALE } from './cli.testing';
import { SPEC_RAILS } from './core/testing-session';

describe('parseOptions', () => {
  it('reads each command against the declared flags', () => {
    expect(parsed(['run', '--goal', 'g.md', '--profile', 'p'])).toEqual({
      command: 'run',
      goalPath: 'g.md',
      profile: 'p',
      headed: true,
      rails: SPEC_RAILS,
      subject: undefined,
      startUrl: undefined,
      documents: [],
      waitForLoopMinutes: 0,
    });
    // `--url` on run is where the browser opens, so the loop never plans on about:blank.
    expect(
      parsed(['run', '--goal', 'g.md', '--profile', 'p', '--url', 'https://x.test/jobs']),
    ).toMatchObject({ startUrl: 'https://x.test/jobs' });
    expect(
      parsed([
        'run',
        '--goal',
        'g.md',
        '--profile',
        'p',
        '--headless',
        '--max-tasks',
        '2',
        '--max-minutes',
        '5',
        '--max-failures',
        '1',
        '--subject',
        'Alex',
      ]),
    ).toMatchObject({
      headed: false,
      rails: { maxTasks: 2, maxMinutes: 5, maxConsecutiveFailures: 1 },
      subject: 'Alex',
    });
    expect(parsed(['login', '--profile', 'p', '--url', 'https://x.test'])).toEqual({
      command: 'login',
      profile: 'p',
      url: 'https://x.test',
    });
    // An export visits the site of each launch naming the profile, and --url's, once each; a profile no launch names visits none.
    expect(parsed(['export-state', '--profile', 'p', '--out', '/tmp/p.json'])).toEqual({
      command: 'export-state',
      profile: 'p',
      out: '/tmp/p.json',
      origins: [],
    });
    expect(
      parsed(['export-state', '--profile', 'linkedin', '--out', '/tmp/l.json']).command ===
        'export-state'
        ? parsed(['export-state', '--profile', 'linkedin', '--out', '/tmp/l.json'])
        : null,
    ).toMatchObject({ origins: ['https://jobs.test'] });
    expect(
      parsed([
        'export-state',
        '--profile',
        'linkedin',
        '--out',
        '/tmp/l.json',
        '--url',
        'https://other.test/path?x=1',
      ]),
    ).toMatchObject({ origins: ['https://jobs.test', 'https://other.test'] });
    expect(
      parsed([
        'export-state',
        '--profile',
        'p',
        '--out',
        '/tmp/p.json',
        '--url',
        'https://jobs.test/x',
      ]),
    ).toMatchObject({ origins: ['https://jobs.test'] });
    expect(parsed(['sessions'])).toEqual({ command: 'sessions', limit: 20, json: false, ...STALE });
    expect(parsed(['sessions', '--limit', '3', '--json'])).toEqual({
      command: 'sessions',
      limit: 3,
      json: true,
      ...STALE,
    });
    expect(parsed(['show', 'abc', '--json'])).toEqual({
      command: 'show',
      id: 'abc',
      json: true,
      ...STALE,
    });
    expect(parsed(['replay-events', 'abc'])).toEqual({ command: 'replay-events', id: 'abc' });
    expect(
      parsed(['teach-again', '--sessions', 'static/sessions', '--subject', 'Ada', '--dry-run']),
    ).toEqual({
      command: 'teach-again',
      sessions: 'static/sessions',
      subject: 'Ada',
      tenant: undefined,
      dryRun: true,
    });
    expect(parsed(['teach-again', '--sessions', 'd', '--tenant', 'verify-1'])).toMatchObject({
      subject: undefined,
      tenant: 'verify-1',
      dryRun: false,
    });
    expect(
      parsed([
        'replay-fields',
        '--sessions',
        'static/sessions',
        '--tenant',
        'verify-1',
        '--sample',
        '40',
        '--judge',
        '--retract',
        '20',
        '--out',
        'tmp/replays',
      ]),
    ).toEqual({
      command: 'replay-fields',
      sessions: 'static/sessions',
      tenant: 'verify-1',
      sample: 40,
      judge: true,
      retract: 20,
      out: 'tmp/replays',
    });
    expect(parsed(['replay-fields', '--sessions', 'd'])).toEqual({
      command: 'replay-fields',
      sessions: 'd',
      tenant: undefined,
      sample: null,
      judge: false,
      retract: null,
      out: 'static/replays',
    });
  });

  it('[BRW-29] takes a run’s arguments from a launch file by name, a flag given beside it winning over the file’s field', () => {
    expect(parsed(['run', '--launch', 'linkedin'])).toEqual({
      command: 'run',
      goalPath: 'goals/linkedin.md',
      profile: 'linkedin',
      headed: true,
      rails: { ...SPEC_RAILS, targetDone: 6, maxTasks: 9, maxMinutes: 120 },
      subject: undefined,
      startUrl: 'https://jobs.test/linkedin',
      documents: [],
      waitForLoopMinutes: 0,
    });
    expect(
      parsed([
        'run',
        '--launch',
        'builtin',
        '--headless',
        '--max-minutes',
        '30',
        '--url',
        'https://jobs.test/other',
        '--wait-for-loop',
        '8',
      ]),
    ).toMatchObject({
      goalPath: 'goals/builtin.md',
      profile: 'builtin',
      headed: false,
      rails: { targetDone: 4, maxTasks: 8, maxMinutes: 30 },
      startUrl: 'https://jobs.test/other',
      documents: [{ name: 'resume', path: 'docs/Resume.pdf' }],
      waitForLoopMinutes: 8,
    });
    // A document named by a flag replaces the file's entry of that name; the goal and profile flags win too.
    expect(
      parsed([
        'run',
        '--launch',
        'builtin',
        '--document',
        'resume=/tmp/other.pdf',
        '--goal',
        'g.md',
      ]),
    ).toMatchObject({ goalPath: 'g.md', documents: [{ name: 'resume', path: '/tmp/other.pdf' }] });
    // A target the flags leave above the file's task budget is refused as any target is.
    const over = parseOptions(
      ['run', '--launch', 'linkedin', '--max-tasks', '3'],
      DEFAULTS,
      launchOf,
    );
    expect(over).toBeInstanceOf(Error);
    expect((over as Error).message).toContain('--target-done 6 is above --max-tasks 3');
  });

  it('[BRW-26] reads each --document as a file supplied for a declared document, in the order given, and none when the flag is absent', () => {
    expect(
      parsed([
        'run',
        '--goal',
        'g.md',
        '--profile',
        'p',
        '--document',
        'resume=docs/resume.pdf',
        '--document',
        'cover-letter=docs/letter.pdf',
      ]),
    ).toMatchObject({
      command: 'run',
      documents: [
        { name: 'resume', path: 'docs/resume.pdf' },
        { name: 'cover-letter', path: 'docs/letter.pdf' },
      ],
    });
    expect(parsed(['run', '--goal', 'g.md', '--profile', 'p'])).toMatchObject({ documents: [] });
  });

  it.each([
    [[], USAGE],
    [['fly'], USAGE],
    [['run', '--profile', 'p'], '--goal is required'],
    [['run', '--goal', 'g.md'], '--profile is required'],
    [['run', '--goal', 'g.md', '--profile', 'p', '--headed', '--headless'], 'contradict'],
    [
      ['run', '--goal', 'g.md', '--profile', 'p', '--max-tasks', 'x'],
      '--max-tasks must be a positive integer',
    ],
    [['run', '--goal', 'g.md', '--profile', 'p', '--bogus'], "Unknown option '--bogus'"],
    [
      ['run', '--goal', 'g.md', '--profile', 'p', '--document', 'x'],
      '--document takes <name>=<path>',
    ],
    [
      ['run', '--goal', 'g.md', '--profile', 'p', '--document', 'Resume=/x.pdf'],
      '--document takes <name>=<path>',
    ],
    [['sessions', '--document', 'resume=/x.pdf'], "Unknown option '--document'"],
    [['login', '--profile', 'p'], '--url is required'],
    [['run', '--launch', 'nope'], '--launch "nope" names no launch file'],
    [
      ['run', '--launch', 'linkedin', '--wait-for-loop', 'soon'],
      '--wait-for-loop must be a whole number of minutes',
    ],
    [['login', '--launch', 'linkedin'], "Unknown option '--launch'"],
    [['export-state', '--profile', 'p'], '--out is required'],
    [['export-state', '--out', '/tmp/p.json'], '--profile is required'],
    [['export-state', '--profile', 'p', '--out', 'f', '--url', 'nowhere'], '--url must be a URL'],
    [['sessions', '--limit', '0'], '--limit must be a positive integer'],
    [['show'], 'show takes one id'],
    [['show', 'a', 'b'], 'show takes one id'],
    [['sessions', 'extra'], 'sessions takes no positional'],
    [['replay-events'], 'replay-events takes one id'],
    [['teach-again'], '--sessions is required'],
    [['teach-again', 'extra', '--sessions', 'd'], 'teach-again takes no positional'],
    [['replay-fields'], '--sessions is required'],
    [['replay-fields', '--sessions', 'd', '--sample', '0'], '--sample must be a positive integer'],
    [
      ['replay-fields', '--sessions', 'd', '--retract', 'x'],
      '--retract must be a positive integer',
    ],
    [['replay-fields', 'extra', '--sessions', 'd'], 'replay-fields takes no positional'],
    // A flag a command does not read is refused by name, never taken and ignored.
    [
      ['run', '--goal', 'g.md', '--profile', 'p', '--tenant', 'verify-1'],
      "Unknown option '--tenant'",
    ],
    [['teach-again', '--sessions', 'd', '--judge'], "Unknown option '--judge'"],
    [['sessions', '--tenant', 'verify-1'], "Unknown option '--tenant'"],
  ])('refuses %j', (argv, message) => {
    const result = parseOptions(argv, DEFAULTS, launchOf);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(message);
  });
});
