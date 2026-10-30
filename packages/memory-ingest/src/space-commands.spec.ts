import { GOLDEN_STRATEGY, memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';

import { SpaceRefused, SpaceUnknown } from './adapters/space-http/named-space';
import { execute } from './cli';
import { forgetRecord, recallRecords, recordHistory } from './space-commands';
import { cliDeps, io, parsed } from './test/cli-harness';
import { MEMORY_URL } from './test/fakes';

const RUN = 'run-golden';
const NAME = 'notes-space';
const FACTS = 'semantic_fact';
const NORTH = { tenant: 'north' };
const provenance = { source: 'memory-ingest:notes', sourceRunId: null };

const fact = (predicate: string, value: string) => ({
  subject: 'Ada',
  predicate,
  value,
  validFrom: null,
});

/** The golden space with two of Ada's facts under the north tenant, one under the south, and one an agent wrote under a project of the north's. */
async function spaceUnderTest() {
  const { client } = memoryClientUnderTest({ strategies: { [RUN]: GOLDEN_STRATEGY } });
  const { space } = await client.ensureSpace(NAME, { runId: RUN });
  const remember = (scope: Record<string, string>, candidate: ReturnType<typeof fact>) =>
    client.remember(space.id, { register: FACTS, scope, candidate, provenance });
  const language = (await remember(NORTH, fact('language', 'TypeScript'))).record;
  const years = (await remember(NORTH, fact('years of experience', 'twelve years'))).record;
  const south = (await remember({ tenant: 'south' }, fact('language', 'Rust'))).record;
  const taught = (
    await remember({ ...NORTH, project: 'assistant' }, fact('asked.notice', 'two weeks'))
  ).record;
  return { client, space, language, years, south, taught };
}

/** The space addressed under the north tenant, narrowed by nothing unless a case says. */
const north = (under: Record<string, string> = {}) => ({ space: NAME, tenant: 'north', under });

const ids = (items: readonly { record: { id: string } }[]) =>
  items.map(({ record }) => record.id).sort();

describe('space commands', () => {
  it('[ING-4] recall reads what the space holds for one tenant alone — by meaning, or exactly by a key — narrowed to a register when asked, and never another tenant’s', async () => {
    const { client, space, language, years, south } = await spaceUnderTest();
    const byText = await recallRecords(
      client,
      { ...north(), key: null, text: 'which language does Ada write', register: null },
      MEMORY_URL,
    );
    expect(byText.space).toEqual({ id: space.id, name: NAME });
    expect(byText.scope).toEqual(NORTH);
    expect(ids(byText.items)).toEqual([language.id, years.id].sort());
    expect(byText.items.some(({ record }) => record.id === south.id)).toBe(false);
    expect(byText.routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ route: 'semantic', skipped: null })]),
    );

    const byKey = await recallRecords(
      client,
      { ...north(), key: 'Ada', text: null, register: FACTS },
      MEMORY_URL,
    );
    expect(ids(byKey.items)).toEqual([language.id, years.id].sort());
    expect(byKey.items.every(({ routes }) => routes.includes('exact'))).toBe(true);
    expect(byKey.routes).toEqual([
      { route: 'exact', registers: [FACTS], hits: 2, dropped: 0, skipped: null },
    ]);
    expect(byKey).toMatchObject({ key: 'Ada', text: null, register: FACTS, omitted: 0 });

    const theirs = await recallRecords(
      client,
      { space: NAME, tenant: 'south', under: {}, key: 'Ada', text: null, register: null },
      MEMORY_URL,
    );
    expect(ids(theirs.items)).toEqual([south.id]);
  });

  it('[ING-4] a record an agent wrote under a key beyond the tenant’s is reached only by a scope that names it — `--under` — and a key the space does not narrow by, or the partition itself, is refused by name', async () => {
    const { client, language, years, taught } = await spaceUnderTest();
    const partitionOnly = await recallRecords(
      client,
      { ...north(), key: 'Ada', text: null, register: FACTS },
      MEMORY_URL,
    );
    expect(ids(partitionOnly.items)).not.toContain(taught.id);
    const underProject = await recallRecords(
      client,
      { ...north({ project: 'assistant' }), key: 'Ada', text: null, register: FACTS },
      MEMORY_URL,
    );
    expect(underProject.scope).toEqual({ ...NORTH, project: 'assistant' });
    // The tenant's facts are seen under the project too: a record is visible to any scope that contains its own.
    expect(ids(underProject.items)).toEqual([language.id, years.id, taught.id].sort());
    const traced = await recordHistory(
      client,
      { ...north({ project: 'assistant' }), recordId: taught.id },
      MEMORY_URL,
    );
    expect(traced.versions.map(({ id }) => id)).toEqual([taught.id]);
    await expect(
      recordHistory(client, { ...north(), recordId: taught.id }, MEMORY_URL),
    ).rejects.toThrow(/record/);

    const unknownKey = recallRecords(
      client,
      { ...north({ team: 'x' }), key: 'Ada', text: null, register: null },
      MEMORY_URL,
    );
    await expect(unknownKey).rejects.toBeInstanceOf(SpaceRefused);
    await expect(unknownKey).rejects.toThrow('--under names team; the space narrows by ');
    await expect(
      recallRecords(
        client,
        { ...north({ tenant: 'south' }), key: 'Ada', text: null, register: null },
        MEMORY_URL,
      ),
    ).rejects.toThrow("(tenant is --tenant's to name)");
  });

  it('[ING-4] history reads every version of a record oldest first, and forget closes the current one with the reason, so a later recall omits it', async () => {
    const { client, space, language } = await spaceUnderTest();
    const updated = await client.update(space.id, {
      recordId: language.id,
      scope: NORTH,
      candidate: fact('language', 'TypeScript and Rust'),
      provenance,
    });
    expect(updated.outcome).toBe('superseded');

    const history = await recordHistory(client, { ...north(), recordId: language.id }, MEMORY_URL);
    expect(history.recordId).toBe(language.id);
    expect(history.versions.map(({ version, status }) => [version, status])).toEqual([
      [1, 'superseded'],
      [2, 'active'],
    ]);

    const forgotten = await forgetRecord(
      client,
      { ...north(), recordId: updated.record.id, reason: 'stated of someone else' },
      MEMORY_URL,
    );
    expect(forgotten.record).toMatchObject({
      id: updated.record.id,
      status: 'invalidated',
      closeReason: 'stated of someone else',
    });
    expect(forgotten.record.closedAt).not.toBeNull();
    const after = await recallRecords(
      client,
      { ...north(), key: 'Ada', text: null, register: FACTS },
      MEMORY_URL,
    );
    expect(after.items.some(({ record }) => record.lineageId === language.lineageId)).toBe(false);
  });

  it('[ING-4] a name no space holds is refused by name before anything is read', async () => {
    const { client } = await spaceUnderTest();
    const unknown = recallRecords(
      client,
      { space: 'nobody', tenant: 'north', under: {}, key: 'Ada', text: null, register: null },
      MEMORY_URL,
    );
    await expect(unknown).rejects.toBeInstanceOf(SpaceUnknown);
    await expect(unknown).rejects.toThrow(`no memory space is named nobody at ${MEMORY_URL}`);
  });

  it('[ING-4] the CLI runs each command over the client and touches no manifest: 0 with the rendered report or its JSON, 2 saying what it could not do — a space nobody holds, a record the scope does not see', async () => {
    const { client, space, language } = await spaceUnderTest();
    const d = cliDeps({ memory: client });
    const recall = io();
    expect(
      await execute(
        parsed(['recall', '--space', NAME, '--tenant', 'north', '--key', 'Ada']),
        d,
        recall.sink,
      ),
    ).toBe(0);
    expect(recall.out[0]).toContain(`${NAME} (${space.id}) · tenant north · key "Ada"`);
    expect(recall.out[0]).toContain(`${language.id}@v1`);
    expect(recall.out[0]).toContain('routes: exact 2 hits');

    const history = io();
    expect(
      await execute(
        parsed(['history', language.id, '--space', NAME, '--tenant', 'north', '--json']),
        d,
        history.sink,
      ),
    ).toBe(0);
    expect(JSON.parse(history.out[0] ?? '')).toMatchObject({
      recordId: language.id,
      versions: [{ id: language.id, version: 1 }],
    });

    const forget = io();
    expect(
      await execute(
        parsed(['forget', language.id, '--space', NAME, '--tenant', 'north', '--reason', 'wrong']),
        d,
        forget.sink,
      ),
    ).toBe(0);
    expect(forget.out[0]).toContain(`${language.id}@v1 invalidated at `);
    expect(forget.out[0]).toContain(': wrong');

    const unknown = io();
    expect(
      await execute(
        parsed(['recall', '--space', 'nobody', '--tenant', 'north', '--key', 'Ada']),
        d,
        unknown.sink,
      ),
    ).toBe(2);
    expect(unknown.errors[0]).toContain(`no memory space is named nobody at ${MEMORY_URL}`);

    const unseen = io();
    expect(
      await execute(
        parsed(['forget', language.id, '--space', NAME, '--tenant', 'south', '--reason', 'wrong']),
        d,
        unseen.sink,
      ),
    ).toBe(2);
    expect(unseen.errors[0]).toContain(language.id);
    expect(d.ledger.saves).toBe(0);
    expect(d.scripted.posted).toHaveLength(0);
  });
});
