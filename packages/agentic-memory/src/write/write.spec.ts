import { MemoryRefused } from '../refusal';
import { failingEmbedder } from '../testing/fakes';
import { spaceUnderTest } from '../testing/space-under-test';
import { history, invalidate, remember, update } from './write';

const TENANT = { tenant: 't1' };
const SOURCE = { source: 'agent', sourceRunId: 'run-1' };

const fact = (value: string, extra: Record<string, unknown> = {}) => ({
  register: 'facts',
  scope: TENANT,
  candidate: { subject: 'acme', predicate: 'language', value, validFrom: null, ...extra },
  provenance: SOURCE,
  metadata: {},
});

const episode = (sourceRunId: string) => ({
  register: 'episodes',
  scope: TENANT,
  candidate: {
    subject: 'acme',
    situation: 'a bid needed a vehicle',
    action: 'checked eligibility first',
    outcome: 'saved a week',
    outcomeVerified: true,
    occurredAt: '2026-09-30T12:00:00.000Z',
    lesson: {
      key: 'check-vehicle-first',
      text: 'Check vehicle eligibility early.',
      playbook: 'qualification',
    },
  },
  provenance: { source: 'agent', sourceRunId },
  metadata: {},
});

const refusalOf = async (write: Promise<unknown>): Promise<string> => {
  try {
    await write;
  } catch (error) {
    if (error instanceof MemoryRefused) return error.code;
    throw error;
  }
  return 'not refused';
};

describe('the write path', () => {
  it('[AGM-3] inserts, leaves what says the same unchanged, and supersedes with the history kept', async () => {
    const { ctx, clock } = spaceUnderTest();
    const first = await remember(ctx, fact('TypeScript'));
    expect(first).toMatchObject({ outcome: 'inserted', record: { version: 1, status: 'active' } });
    expect((await remember(ctx, fact('TypeScript'))).outcome).toBe('unchanged');

    clock.advance(60_000);
    const second = await remember(ctx, fact('Rust'));
    expect(second.outcome).toBe('superseded');
    expect(second.record).toMatchObject({
      version: 2,
      supersedesId: first.record.id,
      lineageId: first.record.id,
    });
    expect(second.superseded).toMatchObject({ id: first.record.id, status: 'superseded' });
    expect(second.superseded?.validTo).toBe(second.record.validFrom);

    const versions = await history(ctx, { recordId: second.record.id, scope: TENANT });
    expect(versions.map((record) => [record.version, record.status])).toEqual([
      [1, 'superseded'],
      [2, 'active'],
    ]);
  });

  it('[AGM-3] appends episodes, one per independent run: a retry is idempotent, another run is more evidence', async () => {
    const { ctx } = spaceUnderTest();
    expect((await remember(ctx, episode('run-1'))).outcome).toBe('inserted');
    expect((await remember(ctx, episode('run-1'))).outcome).toBe('unchanged');
    expect((await remember(ctx, episode('run-2'))).outcome).toBe('inserted');
  });

  it('[AGM-3] refuses a write whose register, verb, scope, candidate or metadata the space does not declare', async () => {
    const { ctx } = spaceUnderTest();
    expect(await refusalOf(remember(ctx, { ...fact('x'), register: 'nowhere' }))).toBe(
      'register.unknown',
    );
    expect(
      await refusalOf(
        remember(ctx, {
          ...fact('x'),
          register: 'playbooks',
          candidate: { name: 'q', description: null, rules: [] },
        }),
      ),
    ).toBe('operation.undeclared');
    expect(await refusalOf(remember(ctx, { ...fact('x'), scope: { user: 'u1' } }))).toBe(
      'scope.invalid',
    );
    expect(
      await refusalOf(remember(ctx, { ...fact('x'), scope: { tenant: 't1', team: 'a' } })),
    ).toBe('scope.invalid');
    expect(await refusalOf(remember(ctx, fact('', {})))).toBe('candidate.invalid');
    expect(await refusalOf(remember(ctx, { ...fact('x'), metadata: { channel: 'email' } }))).toBe(
      'metadata.undeclared',
    );
    expect((await remember(ctx, { ...fact('x'), metadata: { topic: 'stack' } })).outcome).toBe(
      'inserted',
    );
  });

  it('[AGM-3] gives a short-term note its term’s time to live, and never projects it', async () => {
    const { ctx, index } = spaceUnderTest();
    const note = await remember(ctx, {
      register: 'notes',
      scope: TENANT,
      candidate: { key: 'task-7', value: 'awaiting approval' },
      provenance: SOURCE,
      metadata: {},
    });
    expect(Date.parse(note.record.expiresAt ?? '') - Date.parse(note.record.recordedAt)).toBe(
      600_000,
    );
    expect(note.projected).toBe(false);
    expect(index.ids()).not.toContain(note.record.id);
  });

  it('[AGM-4] updates only an addressed, current, visible record with the same identity', async () => {
    const { ctx } = spaceUnderTest();
    const { record } = await remember(ctx, fact('TypeScript'));
    const changed = { subject: 'acme', predicate: 'language', value: 'Go', validFrom: null };
    expect(
      await refusalOf(
        update(ctx, {
          recordId: record.id,
          scope: { tenant: 't2' },
          candidate: changed,
          provenance: SOURCE,
          metadata: null,
        }),
      ),
    ).toBe('record.not_found');
    expect(
      await refusalOf(
        update(ctx, {
          recordId: record.id,
          scope: TENANT,
          candidate: { ...changed, predicate: 'runtime' },
          provenance: SOURCE,
          metadata: null,
        }),
      ),
    ).toBe('identity.mismatch');
    const updated = await update(ctx, {
      recordId: record.id,
      scope: TENANT,
      candidate: changed,
      provenance: SOURCE,
      metadata: null,
    });
    expect(updated).toMatchObject({ outcome: 'superseded', record: { version: 2 } });
    expect(
      await refusalOf(
        update(ctx, {
          recordId: record.id,
          scope: TENANT,
          candidate: changed,
          provenance: SOURCE,
          metadata: null,
        }),
      ),
    ).toBe('record.not_current');
  });

  it('[AGM-4] invalidates with its reason, removes the point, and reaches nothing outside the caller’s scope', async () => {
    const { ctx, index } = spaceUnderTest();
    const { record } = await remember(ctx, fact('TypeScript'));
    expect(index.ids()).toContain(record.id);
    expect(
      await refusalOf(
        invalidate(ctx, { recordId: record.id, scope: { tenant: 't2' }, reason: 'x' }),
      ),
    ).toBe('record.not_found');
    const gone = await invalidate(ctx, {
      recordId: record.id,
      scope: TENANT,
      reason: 'the customer asked',
    });
    expect(gone).toMatchObject({
      status: 'invalidated',
      closeReason: 'the customer asked',
      projected: false,
    });
    expect(index.ids()).not.toContain(record.id);
    expect(
      await refusalOf(invalidate(ctx, { recordId: record.id, scope: TENANT, reason: 'again' })),
    ).toBe('record.not_current');
  });

  it('[AGM-5] keeps a record whose projection failed, unmarked, for the sweep — Postgres is the truth', async () => {
    const { ctx, records, warnings } = spaceUnderTest({
      embedder: failingEmbedder('spec-model', 4),
    });
    const written = await remember(ctx, fact('TypeScript'));
    expect(written).toMatchObject({ outcome: 'inserted', projected: false });
    expect(records.all().map((row) => [row.status, row.projectedInto])).toEqual([['active', null]]);
    expect(warnings).toHaveLength(1);
  });
});
