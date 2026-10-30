import { randomUUID } from 'node:crypto';

import { GOLDEN_STRATEGY } from '@sysdesign/agentic-memory/testing';
import { describe, expect, it } from 'vitest';

import { MemoryHostRefused, SpaceNotCompiled } from './memory-errors';
import { memoryClientUnderTest } from './testing';

/**
 * The in-process adapter against the engine it wraps: every space here is made
 * from the strategy a model wrote in a live run, kept as found, and every
 * assertion is on what the runtime did — a row, a point, a refusal's declared
 * fields — never on a script.
 */
const GOLDEN_RUN = 'run-golden';
const SPACE = 'agent-space';
const FACTS = 'semantic_fact';

/** A project's scope: the partition and the project; a unit's fact adds the unit. */
const PROJECT = { tenant: 't1', project: 'p1' };
const provenance = { source: 'spec', sourceRunId: null };

/** A semantic candidate: one value per subject and predicate, dated at the moment of recording. */
const fact = (subject: string, predicate: string, value: string) => ({
  subject,
  predicate,
  value,
  validFrom: null,
});

/** A client with the golden run declared, and the space ensured from it. */
async function spaceUnderTest() {
  const harness = memoryClientUnderTest({ strategies: { [GOLDEN_RUN]: GOLDEN_STRATEGY } });
  const { space } = await harness.client.ensureSpace(SPACE, { runId: GOLDEN_RUN });
  return { ...harness, space };
}

/** The fault a call raised, or what it did instead — so a spec asserts a refusal by its declared fields. */
async function faultOf(
  call: Promise<unknown>,
): Promise<MemoryHostRefused | SpaceNotCompiled | 'answered'> {
  try {
    await call;
  } catch (error) {
    if (error instanceof MemoryHostRefused || error instanceof SpaceNotCompiled) return error;
    throw error;
  }
  return 'answered';
}

describe('the in-process memory client', () => {
  it('[AMC-4] ensures a space from a declared run — made once, the same space for that run again — and reads it back by id and by name, null for one nobody made', async () => {
    const { client } = memoryClientUnderTest({ strategies: { [GOLDEN_RUN]: GOLDEN_STRATEGY } });

    const made = await client.ensureSpace(SPACE, { runId: GOLDEN_RUN });
    expect(made.created).toBe(true);
    expect(made.space).toMatchObject({
      name: SPACE,
      designRunId: GOLDEN_RUN,
      scopeKeys: ['tenant', 'project', 'user', 'unit'],
      report: { problems: [] },
    });
    expect(made.space.report.registers.map(({ name }) => name)).toContain(FACTS);

    expect(await client.ensureSpace(SPACE, { runId: GOLDEN_RUN })).toEqual({
      space: made.space,
      created: false,
    });
    expect(await client.getSpace(made.space.id)).toEqual(made.space);
    expect(await client.getSpaceByName(SPACE)).toEqual(made.space);
    expect(await client.getSpace(randomUUID())).toBeNull();
    expect(await client.getSpaceByName('nobody-s-space')).toBeNull();
  });

  it('[AMC-4] walks a semantic fact through the engine: remembered once, recalled by meaning and by key, superseded in place, read back whole, invalidated and gone', async () => {
    const { client, space, index } = await spaceUnderTest();

    const first = await client.remember(space.id, {
      register: FACTS,
      scope: PROJECT,
      candidate: fact('the-agent', 'language', 'TypeScript'),
      provenance,
    });
    expect(first).toMatchObject({
      outcome: 'inserted',
      projected: true,
      superseded: null,
      record: {
        register: FACTS,
        kind: 'semantic',
        scope: PROJECT,
        identity: '["the-agent","language"]',
        keys: ['the-agent'],
        version: 1,
        status: 'active',
        // The door's default, applied here as at the host: no metadata was sent.
        metadata: {},
      },
    });
    // The same fact again is the same record, unchanged: identity, not a second row.
    expect(
      await client.remember(space.id, {
        register: FACTS,
        scope: PROJECT,
        candidate: fact('the-agent', 'language', 'TypeScript'),
        provenance,
      }),
    ).toMatchObject({ outcome: 'unchanged', record: { id: first.record.id } });

    const byMeaning = await client.recall(space.id, {
      scope: PROJECT,
      registers: [FACTS],
      text: 'which language the agent writes',
    });
    expect(byMeaning.items.map(({ record, routes }) => [record.id, routes])).toEqual([
      [first.record.id, ['semantic']],
    ]);
    expect(byMeaning.routes).toEqual([
      { route: 'semantic', registers: [FACTS], hits: 1, dropped: 0, skipped: null },
    ]);
    // No registers named: the door's default recalls every register that declares recall.
    const byKey = await client.recall(space.id, { scope: PROJECT, key: 'the-agent' });
    expect(byKey.items.map(({ record, routes }) => [record.id, routes])).toEqual([
      [first.record.id, ['exact']],
    ]);
    expect(byKey.routes).toMatchObject([{ route: 'exact', hits: 1 }]);

    const second = await client.update(space.id, {
      recordId: first.record.id,
      scope: PROJECT,
      candidate: fact('the-agent', 'language', 'TypeScript and Go'),
      provenance,
    });
    expect(second).toMatchObject({
      outcome: 'superseded',
      record: {
        version: 2,
        supersedesId: first.record.id,
        lineageId: first.record.id,
        status: 'active',
      },
      superseded: { id: first.record.id, status: 'superseded' },
    });
    // One current record per identity: the key now finds the successor alone.
    const current = await client.recall(space.id, { scope: PROJECT, key: 'the-agent' });
    expect(current.items.map(({ record }) => [record.id, record.version])).toEqual([
      [second.record.id, 2],
    ]);

    const lineage = await client.history(space.id, { recordId: first.record.id, scope: PROJECT });
    expect(lineage.map(({ version, status }) => [version, status])).toEqual([
      [1, 'superseded'],
      [2, 'active'],
    ]);

    expect(
      await client.invalidate(space.id, {
        recordId: second.record.id,
        scope: PROJECT,
        reason: 'the agent moved on',
      }),
    ).toMatchObject({
      id: second.record.id,
      status: 'invalidated',
      closeReason: 'the agent moved on',
      projected: false,
    });

    const gone = await client.recall(space.id, {
      scope: PROJECT,
      registers: [FACTS],
      key: 'the-agent',
      text: 'which language the agent writes',
    });
    expect(gone.items).toEqual([]);
    expect(gone.routes.map(({ route, hits }) => [route, hits])).toEqual([
      ['exact', 0],
      ['semantic', 0],
    ]);
    // Its point left the index with it.
    expect(index.ids()).toEqual([]);
    // Consolidation runs over the same scope; with no episode in it, it learns nothing.
    expect(await client.consolidate(space.id, { scope: PROJECT })).toEqual({
      groups: 0,
      lessons: [],
      playbooks: [],
    });
  });

  it("[AMC-4] shows a memory only to a request whose scope contains its own — a unit's fact to that unit alone, a project's fact to every unit — and leaks no existence across scopes", async () => {
    const { client, space } = await spaceUnderTest();
    const unitX = { ...PROJECT, unit: 'x' };
    const unitY = { ...PROJECT, unit: 'y' };
    const ofUnit = await client.remember(space.id, {
      register: FACTS,
      scope: unitX,
      candidate: fact('the-brief', 'deadline', 'the first of the month'),
      provenance,
    });
    const ofProject = await client.remember(space.id, {
      register: FACTS,
      scope: PROJECT,
      candidate: fact('the-project', 'owner', 'the platform team'),
      provenance,
    });

    /** What a request in this scope recalls, by meaning (the index) and by key (the rows) — the two stores agree. */
    const seenBy = async (scope: Record<string, string>, key: string) => {
      const byMeaning = await client.recall(space.id, {
        scope,
        registers: [FACTS],
        text: 'what is known here',
      });
      const byKey = await client.recall(space.id, { scope, registers: [FACTS], key });
      return {
        byMeaning: byMeaning.items.map(({ record }) => record.id).sort(),
        byKey: byKey.items.map(({ record }) => record.id),
      };
    };

    // A request naming no unit, and one naming another unit, see the project's fact alone.
    expect(await seenBy(PROJECT, 'the-brief')).toEqual({
      byMeaning: [ofProject.record.id],
      byKey: [],
    });
    expect(await seenBy(unitY, 'the-brief')).toEqual({
      byMeaning: [ofProject.record.id],
      byKey: [],
    });
    // The unit sees its own fact and the project's.
    expect(await seenBy(unitX, 'the-brief')).toEqual({
      byMeaning: [ofUnit.record.id, ofProject.record.id].sort(),
      byKey: [ofUnit.record.id],
    });

    // Addressed by id from a scope that cannot see it, the unit's fact is not found — never "forbidden".
    expect(
      await faultOf(client.history(space.id, { recordId: ofUnit.record.id, scope: PROJECT })),
    ).toMatchObject({
      status: 404,
      code: 'record.not_found',
      missing: 'record',
      route: 'POST /spaces/:id/history',
    });
  });

  it("[AMC-4] raises the runtime's refusals as the host answers them — at the status the contracts declare, naming what a 404 did not find — and a request the door refuses as its 400 with every offending path", async () => {
    const { client, space } = await spaceUnderTest();

    // The golden strategy declares recall and update on its relations, never remember.
    expect(
      await faultOf(
        client.remember(space.id, {
          register: 'relational_graph',
          scope: PROJECT,
          candidate: {},
          provenance,
        }),
      ),
    ).toMatchObject({
      status: 422,
      code: 'operation.undeclared',
      missing: null,
      issues: [],
      route: 'POST /spaces/:id/remember',
    });
    expect(
      await faultOf(client.recall(space.id, { scope: { ...PROJECT, team: 'a' }, key: 'k' })),
    ).toMatchObject({ status: 422, code: 'scope.invalid', route: 'POST /spaces/:id/recall' });
    // The runtime's issues ride along: a candidate that is not a semantic memory names its missing fields.
    expect(
      await faultOf(
        client.remember(space.id, {
          register: FACTS,
          scope: PROJECT,
          candidate: { subject: 'the-agent' },
          provenance,
        }),
      ),
    ).toMatchObject({
      status: 422,
      code: 'candidate.invalid',
      issues: [{ path: 'predicate' }, { path: 'value' }, { path: 'validFrom' }],
    });

    // A body the contract refuses never reaches the runtime: the door's 400, no code, each path named.
    expect(
      await faultOf(
        client.remember(space.id, {
          register: FACTS,
          scope: PROJECT,
          candidate: fact('the-agent', 'language', 'TypeScript'),
          provenance: { source: '', sourceRunId: null },
        }),
      ),
    ).toMatchObject({
      status: 400,
      code: null,
      message: 'validation failed',
      missing: null,
      issues: [{ path: 'provenance.source' }],
      route: 'POST /spaces/:id/remember',
    });
    // The contract's refinement too: a recall must name a key, a text or a time range.
    expect(await faultOf(client.recall(space.id, { scope: PROJECT }))).toMatchObject({
      status: 400,
      code: null,
      issues: [{ path: '' }],
    });
    // And the path parameters, as the door reads them.
    expect(await faultOf(client.getSpace('not-a-uuid'))).toMatchObject({
      status: 400,
      code: null,
      route: 'GET /spaces/:id',
    });
    expect(await faultOf(client.getSpaceByName('Not A Name'))).toMatchObject({
      status: 400,
      code: null,
      route: 'GET /spaces/by-name/:name',
    });
  });

  it('[AMC-4] refuses to ensure a space from a run the spec did not declare, under a name another run holds, or from a strategy that does not compile — and keeps nothing for the last', async () => {
    const { client } = memoryClientUnderTest({
      strategies: {
        [GOLDEN_RUN]: GOLDEN_STRATEGY,
        'run-unreadable': { registers: 'not a list' },
      },
    });
    const made = await client.ensureSpace(SPACE, { runId: GOLDEN_RUN });

    expect(
      await faultOf(client.ensureSpace('another-space', { runId: 'run-nobody-declared' })),
    ).toMatchObject({
      status: 404,
      code: 'run.not_found',
      missing: 'run',
      route: 'PUT /spaces/by-name/:name',
    });
    // The run is read only where a space is to be made: a held name is the other run's claim, never a missing run.
    expect(
      await faultOf(client.ensureSpace(SPACE, { runId: 'run-nobody-declared' })),
    ).toMatchObject({ status: 409, code: 'space.name_taken', missing: null });
    expect(await client.getSpaceByName(SPACE)).toEqual(made.space);

    const notCompiled = await faultOf(
      client.ensureSpace('unreadable-space', { runId: 'run-unreadable' }),
    );
    expect(notCompiled).toBeInstanceOf(SpaceNotCompiled);
    expect(notCompiled).toMatchObject({
      report: { problems: [{ code: 'strategy.unreadable' }] },
    });
    expect(await client.getSpaceByName('unreadable-space')).toBeNull();

    // The door reads the name before the runtime does.
    expect(await faultOf(client.ensureSpace('Not A Name', { runId: GOLDEN_RUN }))).toMatchObject({
      status: 400,
      code: null,
      route: 'PUT /spaces/by-name/:name',
    });
  });

  it('[AMC-4] runs no digest: a digest is a loop run, specced against the HTTP adapter with a scripted fetch — each digest verb rejects, as the port promises, and never throws at the call', async () => {
    const { client, space } = await spaceUnderTest();
    const noDigests =
      'the in-process memory client runs no digests: a digest is a loop run; spec that seam against HttpMemoryClient with a scripted fetch';
    await expect(
      client.startDigest(space.id, {
        title: 'a text',
        parts: [{ label: null, at: null, text: 'something said' }],
        scope: PROJECT,
        provenance,
      }),
    ).rejects.toThrow(noDigests);
    await expect(client.getDigest(space.id, randomUUID())).rejects.toThrow(noDigests);
    await expect(client.applyDigest(space.id, randomUUID())).rejects.toThrow(noDigests);
  });
});
