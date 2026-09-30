import { BadRequestException, NotFoundException } from '@nestjs/common';
import { leadsReportOf, noticeOf, pullReportOf, sliceReportOf } from '@sysdesign/contracts';

import { execute, parseOptions, USAGE, type CliService, type Io, type Options } from './cli';

const parsed = (argv: string[]): Options => {
  const options = parseOptions(argv);
  if (options instanceof Error) throw options;
  return options;
};

describe('parseOptions', () => {
  it('reads each command with its options and leaves the window rule to the service', () => {
    expect(parsed(['pull'])).toMatchObject({
      command: 'pull',
      profile: 'enfav',
      window: { days: undefined, from: undefined, to: undefined },
      json: false,
    });
    expect(parsed(['pull', '--days', '7', '--profile', 'x']).window).toEqual({
      days: 7,
      from: undefined,
      to: undefined,
    });
    expect(parsed(['pull', '--from', '2026-09-01', '--to', '2026-09-02']).window).toEqual({
      days: undefined,
      from: '2026-09-01',
      to: '2026-09-02',
    });
    expect(
      parsed(['leads', '--min-score', '40', '--tier', 'high', '--limit', '5', '--json']),
    ).toMatchObject({
      command: 'leads',
      minScore: 40,
      tier: 'high',
      limit: 5,
      json: true,
    });
    expect(parsed(['show', 'n-1', '--description'])).toMatchObject({
      command: 'show',
      noticeId: 'n-1',
      description: true,
    });
    expect(parsed(['search']).limit).toBe(25);
  });

  it.each([
    [[], USAGE],
    [['fly'], USAGE],
    [['show'], 'show takes one notice id'],
    [['show', 'a', 'b'], 'show takes one notice id'],
    [['leads', '--tier', 'huge'], '--tier must be one of high, medium, low'],
    [['leads', '--limit', 'many'], '--limit must be a non-negative integer'],
    [['pull', '--days', '1.5'], '--days must be a non-negative integer'],
    [['pull', '--bogus'], "Unknown option '--bogus'"],
  ])('refuses %j', (argv, message) => {
    const result = parseOptions(argv);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(message);
  });
});

describe('execute', () => {
  const io = () => {
    const out: string[] = [];
    const errors: string[] = [];
    const sink: Io = { out: (t) => out.push(t), error: (t) => errors.push(t) };
    return { out, errors, sink };
  };
  const service = (overrides: Partial<CliService> = {}): CliService => ({
    pull: async () => pullReportOf(),
    leads: async () => leadsReportOf(),
    notice: async () => noticeOf(),
    fetchDescription: async () => ({ status: 'ok', description: { text: 'x', fetchedAt: 'y' } }),
    ...overrides,
  });

  it('renders a pull and its leads as text, or as one JSON document, exiting 0', async () => {
    const { out, sink } = io();
    expect(await execute(parsed(['search']), service(), sink)).toBe(0);
    expect(out[0]).toContain('pull · profile tiny');
    expect(out[0]).toContain('leads · profile tiny');

    const json = io();
    expect(await execute(parsed(['leads', '--json']), service(), json.sink)).toBe(0);
    expect(JSON.parse(json.out[0] ?? '')).toEqual(leadsReportOf());
  });

  it('exits 1 when a pull stored nothing, and when the notice is not stored', async () => {
    const empty = pullReportOf({
      slices: [sliceReportOf({ outcome: 'error', pages: 0, inserted: 0, received: 0 })],
    });
    expect(await execute(parsed(['pull']), service({ pull: async () => empty }), io().sink)).toBe(
      1,
    );

    const { errors, sink } = io();
    expect(
      await execute(parsed(['show', 'gone']), service({ notice: async () => null }), sink),
    ).toBe(1);
    expect(errors).toEqual(['no stored notice gone — pull first']);
  });

  it('reports a description that was not fetched on stderr and still shows the notice', async () => {
    const { errors, out, sink } = io();
    const spent = service({
      fetchDescription: async () => ({ status: 'budget-exhausted', spent: 3, budget: 3 }),
    });
    expect(await execute(parsed(['show', 'n-1', '--description']), spent, sink)).toBe(0);
    expect(errors).toEqual(['description not fetched — budget 3/3 spent']);
    expect(out[0]).toContain('Additive manufacturing of replacement brackets');
  });

  it('exits 2 on an unknown profile or a window the plan cannot run, 1 on anything else', async () => {
    const { errors, sink } = io();
    const unknown = service({
      pull: async () => {
        throw new NotFoundException('unknown profile nope');
      },
    });
    expect(await execute(parsed(['pull', '--profile', 'nope']), unknown, sink)).toBe(2);
    const backwards = service({
      pull: async () => {
        throw new BadRequestException('window starts after it ends');
      },
    });
    expect(await execute(parsed(['pull']), backwards, sink)).toBe(2);
    const down = service({
      leads: async () => {
        throw new Error('connection refused');
      },
    });
    expect(await execute(parsed(['leads']), down, sink)).toBe(1);
    expect(errors).toEqual([
      'unknown profile nope',
      'window starts after it ends',
      'connection refused',
    ]);
  });
});
