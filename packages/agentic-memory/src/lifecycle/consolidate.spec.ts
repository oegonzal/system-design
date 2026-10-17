import { MemoryRefused } from '../refusal';
import { present, strategyFixture } from '../testing/fixtures';
import { spaceUnderTest } from '../testing/space-under-test';
import { invalidate, remember } from '../write/write';
import { consolidate } from './consolidate';

const TENANT = { tenant: 't1' };

const episode = (
  run: string,
  key: string,
  scope: Record<string, string> = TENANT,
  verified = true,
) => ({
  register: 'episodes',
  scope,
  candidate: {
    subject: 'qualification',
    situation: `bid ${run}`,
    action: 'checked eligibility first',
    outcome: verified ? 'saved a week' : 'unclear',
    outcomeVerified: verified,
    occurredAt: '2026-09-30T12:00:00.000Z',
    lesson: { key, text: `lesson ${key}`, playbook: 'qualify' },
  },
  provenance: { source: 'agent', sourceRunId: run },
  metadata: {},
});

const outcomes = (entries: { key: string; outcome: string; support: number }[]) =>
  entries.map(({ key, outcome, support }) => `${key}:${outcome}:${support}`);

describe('consolidation', () => {
  it('[AGM-8] turns verified episodes from enough independent runs into a lesson that cites them, and a repeat pass changes nothing', async () => {
    const { ctx } = spaceUnderTest();
    await remember(ctx, episode('r1', 'vehicle-first'));
    await remember(ctx, episode('r1-retry', 'vehicle-first', TENANT, false));
    expect((await consolidate(ctx, { scope: TENANT })).lessons).toEqual([]);

    const second = await remember(ctx, episode('r2', 'vehicle-first'));
    const first = await consolidate(ctx, { scope: TENANT });
    expect(outcomes(first.lessons)).toEqual(['vehicle-first:inserted:2']);
    const lesson = present(
      await ctx.ports.records.get(ctx.spaceId, first.lessons[0]?.recordId ?? ''),
      'the lesson',
    );
    expect(lesson.text).toBe('vehicle-first — lesson: lesson vehicle-first');
    expect(lesson.provenance.derivedFrom).toContain(second.record.id);
    expect(lesson.support).toBe(2);

    const again = await consolidate(ctx, { scope: TENANT });
    expect(outcomes(again.lessons)).toEqual(['vehicle-first:unchanged:2']);
    expect(again.lessons[0]?.recordId).toBe(first.lessons[0]?.recordId);
  });

  it('[AGM-8] reinforces a lesson as runs accrue, promotes it at its threshold, and versions the playbook only when its rules change', async () => {
    const { ctx } = spaceUnderTest();
    for (const run of ['r1', 'r2']) await remember(ctx, episode(run, 'a-vehicle-first'));
    expect((await consolidate(ctx, { scope: TENANT })).playbooks).toEqual([]);

    const third = await remember(ctx, episode('r3', 'a-vehicle-first'));
    const promoted = await consolidate(ctx, { scope: TENANT });
    expect(outcomes(promoted.lessons)).toEqual(['a-vehicle-first:reinforced:3']);
    expect(outcomes(promoted.playbooks)).toEqual(['qualify:inserted:3']);

    for (const run of ['r4', 'r5', 'r6']) await remember(ctx, episode(run, 'b-past-performance'));
    const both = await consolidate(ctx, { scope: TENANT });
    expect(outcomes(both.playbooks)).toEqual(['qualify:superseded:3']);
    const v2 = present(
      await ctx.ports.records.get(ctx.spaceId, both.playbooks[0]?.recordId ?? ''),
      'playbook v2',
    );
    expect(v2.version).toBe(2);
    expect(v2.body['rules']).toEqual([
      { key: 'a-vehicle-first', text: 'lesson a-vehicle-first' },
      { key: 'b-past-performance', text: 'lesson b-past-performance' },
    ]);

    // Two of the first lesson's three runs are retracted: it falls below its support and is withdrawn.
    const episodes = await ctx.ports.records.find({
      spaceId: ctx.spaceId,
      registers: ['episodes'],
      partition: 't1',
      scope: TENANT,
      scopeMode: 'within',
      now: ctx.ports.clock(),
      key: 'qualification',
      limit: null,
    });
    for (const retracted of episodes.filter(
      (record) =>
        record.id !== third.record.id &&
        (record.body['lesson'] as { key: string } | null)?.key === 'a-vehicle-first',
    )) {
      await invalidate(ctx, { recordId: retracted.id, scope: TENANT, reason: 'retracted' });
    }
    const withdrawn = await consolidate(ctx, { scope: TENANT });
    expect(outcomes(withdrawn.lessons)).toEqual([
      'b-past-performance:unchanged:3',
      'a-vehicle-first:withdrawn:3',
    ]);
    expect(outcomes(withdrawn.playbooks)).toEqual(['qualify:superseded:3']);
    const v3 = present(
      await ctx.ports.records.get(ctx.spaceId, withdrawn.playbooks[0]?.recordId ?? ''),
      'playbook v3',
    );
    expect(v3.version).toBe(3);
    expect(v3.body['rules']).toEqual([
      { key: 'b-past-performance', text: 'lesson b-past-performance' },
    ]);
  });

  it('[AGM-8] never merges scopes: each user’s episodes are their own evidence', async () => {
    const { ctx } = spaceUnderTest();
    await remember(ctx, episode('r1', 'shared-key', { tenant: 't1', user: 'u1' }));
    await remember(ctx, episode('r2', 'shared-key', { tenant: 't1', user: 'u2' }));
    const result = await consolidate(ctx, { scope: TENANT });
    expect(result.groups).toBe(2);
    expect(result.lessons).toEqual([]);
  });

  it('[AGM-8] is refused where the strategy declares no consolidation route', async () => {
    const strategy = strategyFixture();
    strategy.workflows = strategy.workflows.filter(
      (workflow) => workflow.kind !== 'consolidation_promotion',
    );
    const { ctx } = spaceUnderTest({ strategy });
    await expect(consolidate(ctx, { scope: TENANT })).rejects.toBeInstanceOf(MemoryRefused);
  });
});
