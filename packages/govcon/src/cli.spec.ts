import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  entityOf,
  leadsReportOf,
  noticeOf,
  pullReportOf,
  sliceReportOf,
  storedProfileOf,
} from '@sysdesign/contracts';

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
      profile: undefined,
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
    expect(
      parsed([
        'awards',
        'fetch',
        '--naics',
        '332710,541511',
        '--from',
        '2026-06-01',
        '--to',
        '2026-09-29',
      ]).awards,
    ).toEqual({
      naics: ['332710', '541511'],
      psc: [],
      from: '2026-06-01',
      to: '2026-09-29',
      sources: ['sam.gov', 'usaspending'],
    });
    expect(
      parsed([
        'awards',
        'fetch',
        '--psc',
        '4920',
        '--from',
        '2026-06-01',
        '--to',
        '2026-09-29',
        '--sources',
        'usaspending',
      ]).awards?.sources,
    ).toEqual(['usaspending']);
    expect(parsed(['entities', 'lookup', 'ABC123DEF456', 'ZZZ000000001'])).toMatchObject({
      command: 'entities',
      ueis: ['ABC123DEF456', 'ZZZ000000001'],
    });
    expect(parsed(['profiles', 'list', '--json'])).toMatchObject({
      command: 'profiles',
      json: true,
    });
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
    [['awards'], 'awards takes the subcommand fetch'],
    [['awards', 'fetch', '--naics', '33'], 'awards fetch takes --from and --to'],
    [
      ['awards', 'fetch', '--from', '2026-06-01', '--to', '2026-09-29'],
      'awards fetch takes --naics or --psc',
    ],
    [
      [
        'awards',
        'fetch',
        '--naics',
        '33',
        '--from',
        '2026-06-01',
        '--to',
        '2026-09-29',
        '--sources',
        'ebay',
      ],
      '--sources must be among',
    ],
    [['entities', 'lookup'], 'entities lookup takes UEIs'],
    [['profiles', 'show'], 'profiles takes the subcommand list'],
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
    fetchAwards: async () => ({
      slices: [
        {
          source: 'sam.gov',
          code: '332710',
          outcome: 'ok',
          pages: 1,
          received: 3,
          inserted: 3,
          updated: 0,
          truncated: false,
          detail: null,
        },
      ],
      spent: 1,
      budget: 1000,
    }),
    lookupEntities: async () => ({
      entities: [entityOf()],
      unknown: ['ZZZ000000001'],
      spent: 2,
      budget: 1000,
    }),
    listProfiles: async () => [storedProfileOf()],
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

  it('renders an awards fetch, an entity lookup and the profiles, exiting 1 when no awards slice succeeded', async () => {
    const { out, sink } = io();
    expect(
      await execute(
        parsed([
          'awards',
          'fetch',
          '--naics',
          '332710',
          '--from',
          '2026-06-01',
          '--to',
          '2026-09-29',
        ]),
        service(),
        sink,
      ),
    ).toBe(0);
    expect(out[0]).toMatch(/sam\.gov\s+332710\s+ok\s+1\s+3\s+3/);
    expect(out[0]).toContain('budget: 1/1000 sam.gov attempts');
    const empty = service({ fetchAwards: async () => ({ slices: [], spent: 0, budget: 1 }) });
    expect(
      await execute(
        parsed(['awards', 'fetch', '--naics', '33', '--from', '2026-06-01', '--to', '2026-09-29']),
        empty,
        io().sink,
      ),
    ).toBe(1);

    const entities = io();
    expect(
      await execute(parsed(['entities', 'lookup', 'ABC123DEF456']), service(), entities.sink),
    ).toBe(0);
    expect(entities.out[0]).toContain('PRECISION PARTS CO');
    expect(entities.out[0]).toContain('332710*');
    expect(entities.out[0]).toContain('unknown: ZZZ000000001');

    const profiles = io();
    expect(await execute(parsed(['profiles', 'list']), service(), profiles.sink)).toBe(0);
    expect(profiles.out[0]).toMatch(/tiny\s+Tiny LLC\s+yes/);
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
