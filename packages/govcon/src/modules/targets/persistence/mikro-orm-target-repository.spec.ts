import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, GovconTarget, ormOptions, truncateTestTables } from '@sysdesign/db';

import { MikroOrmTargetRepository } from './mikro-orm-target-repository';

describe('the target repository in Postgres', () => {
  let orm: MikroORM;
  const t1 = new Date('2026-09-25T10:00:00Z');
  const t2 = new Date('2026-09-26T10:00:00Z');
  const t3 = new Date('2026-09-27T10:00:00Z');
  const AWARD = { kind: 'award' as const, subject: 'CONT_AWD_1' };
  const FIRM = { kind: 'firm' as const, subject: 'JCBMLGPE6Z71' };
  const input = {
    label: 'N6660426P0205',
    stage: 'watching' as const,
    notes: '',
    nextAction: '',
    contacts: [],
    links: [],
    activity: [],
    reminderAt: null,
  };

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
  });
  beforeEach(() => truncateTestTables(orm.em, [GovconTarget]));
  afterAll(async () => {
    await truncateTestTables(orm.em, [GovconTarget]);
    await orm.close(true);
  });

  it('[GOV-31] keeps one row per kind and subject, lands a second save on it with the stage’s day moved only by a new stage, lists newest change first under a kind or a stage, and removes by what it is about', async () => {
    const targets = new MikroOrmTargetRepository(orm.em);
    expect(await targets.find(AWARD)).toBeNull();
    const kept = await targets.save(AWARD, input, t1);
    expect(kept).toEqual({
      id: kept.id,
      ...AWARD,
      ...input,
      endsAt: null,
      stageChangedAt: t1,
      createdAt: t1,
      updatedAt: t1,
    });

    const noted = await targets.save(AWARD, { ...input, notes: 'Call in March.' }, t2);
    expect(noted).toEqual({ ...kept, notes: 'Call in March.', updatedAt: t2 });
    const moved = await targets.save(
      AWARD,
      {
        ...input,
        stage: 'researching',
        reminderAt: t3,
        nextAction: 'Ask for the program manager.',
        contacts: [{ name: 'A. Officer', role: 'program-manager', channel: '', note: '' }],
      },
      t3,
    );
    expect(moved).toMatchObject({
      id: kept.id,
      stage: 'researching',
      reminderAt: t3,
      nextAction: 'Ask for the program manager.',
      contacts: [{ name: 'A. Officer', role: 'program-manager', channel: '', note: '' }],
      stageChangedAt: t3,
      createdAt: t1,
    });
    expect(await orm.em.fork().count(GovconTarget, {})).toBe(1);

    await targets.save(FIRM, { ...input, label: 'BOOZ ALLEN HAMILTON INC', stage: 'talking' }, t2);
    const [all, total] = await targets.list({ kind: null, stage: null, limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(all.map((row) => row.subject)).toEqual(['CONT_AWD_1', 'JCBMLGPE6Z71']);
    expect((await targets.listAll()).map((row) => row.subject)).toEqual([
      'CONT_AWD_1',
      'JCBMLGPE6Z71',
    ]);
    expect(
      (await targets.list({ kind: 'firm', stage: null, limit: 10, offset: 0 }))[0].map(
        (row) => row.label,
      ),
    ).toEqual(['BOOZ ALLEN HAMILTON INC']);
    expect((await targets.list({ kind: null, stage: 'watching', limit: 10, offset: 0 }))[1]).toBe(
      0,
    );
    expect((await targets.list({ kind: null, stage: null, limit: 1, offset: 1 }))[0]).toHaveLength(
      1,
    );

    expect(await targets.remove(FIRM)).toBe(true);
    expect(await targets.remove(FIRM)).toBe(false);
    expect(await targets.find(AWARD)).not.toBeNull();
  });

  it('[GOV-32] writes what a warm read of an award’s end and nothing else — never the day a person last changed it — keeps it across a later save, and answers false for what is not tracked', async () => {
    const targets = new MikroOrmTargetRepository(orm.em);
    const kept = await targets.save(AWARD, input, t1);
    expect(await targets.observe(AWARD, '2027-01-21')).toBe(true);
    expect(await targets.find(AWARD)).toEqual({ ...kept, endsAt: '2027-01-21' });

    const saved = await targets.save(AWARD, { ...input, notes: 'Extended.' }, t2);
    expect(saved.endsAt).toBe('2027-01-21');
    expect(await targets.observe(AWARD, null)).toBe(true);
    expect((await targets.find(AWARD))?.endsAt).toBeNull();
    expect(await targets.observe(FIRM, '2027-01-21')).toBe(false);
  });

  it('[GOV-31] the table itself refuses a stage that is not the kind’s own, and a second row for one kind and subject', async () => {
    const insert = (id: string, kind: string, stage: string) =>
      orm.em
        .fork()
        .execute(
          `insert into "govcon_target" (id, kind, subject, label, stage, notes, next_action, contacts, links, activity, stage_changed_at, created_at, updated_at) values (?, ?, 'S', 'L', ?, '', '', '[]', '[]', '[]', now(), now(), now())`,
          [id, kind, stage],
        );
    await insert('00000000-0000-4000-8000-000000000001', 'firm', 'contacted');
    await expect(
      insert('00000000-0000-4000-8000-000000000002', 'firm', 'watching'),
    ).rejects.toThrow(/govcon_target_stage_check/);
    await expect(insert('00000000-0000-4000-8000-000000000003', 'grant', 'passed')).rejects.toThrow(
      /govcon_target_kind_check/,
    );
    await expect(insert('00000000-0000-4000-8000-000000000004', 'firm', 'talking')).rejects.toThrow(
      /govcon_target_kind_subject_unique/,
    );
  });
});
