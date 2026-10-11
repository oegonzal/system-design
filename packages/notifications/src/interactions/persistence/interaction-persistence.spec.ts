import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { InteractionOutcome } from '@sysdesign/contracts';
import {
  ensureDatabase,
  Interaction,
  InteractionDelivery,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { promptOf } from '../../channels/testing';
import { MikroOrmInteractionStore } from './mikro-orm-interaction-store';

const AT = new Date('2026-10-11T12:00:00Z');
const later = (ms: number): Date => new Date(AT.getTime() + ms);

describe('the interactions in Postgres', () => {
  let orm: MikroORM;
  let store: MikroOrmInteractionStore;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    store = new MikroOrmInteractionStore(orm.em);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em.fork(), [InteractionDelivery, Interaction]);
    await orm.close(true);
  });

  beforeEach(async () => {
    await truncateTestTables(orm.em.fork(), [InteractionDelivery, Interaction]);
  });

  it('[NTF-4] opens a prompt once, and finds it by the messages it was delivered as', async () => {
    const prompt = promptOf();
    await store.open(prompt, AT);
    await store.open({ ...prompt, title: 'Changed' }, later(1));
    expect(await store.find(prompt.id)).toEqual({
      prompt,
      state: 'open',
      outcome: null,
      openedAt: AT,
      closedAt: null,
    });

    await store.recordDelivery(prompt.id, 'phone', { address: 'chat-1', messageRef: '41' }, AT);
    await store.recordDelivery(prompt.id, 'desk', { address: 'me', messageRef: 'm1' }, AT);
    expect(
      (await store.deliveries(prompt.id)).map((d) => [d.channel, d.messageRef, d.closedAt]),
    ).toEqual([
      ['phone', '41', null],
      ['desk', 'm1', null],
    ]);
    expect((await store.byMessage('phone', 'chat-1', '41'))?.prompt.id).toBe(prompt.id);
    expect(await store.byMessage('phone', 'chat-2', '41')).toBeNull();

    const other = promptOf();
    await store.open(other, later(5));
    await store.recordDelivery(
      other.id,
      'phone',
      { address: 'chat-1', messageRef: '42' },
      later(5),
    );
    expect((await store.openAt('phone', 'chat-1')).map((record) => record.prompt.id)).toEqual([
      prompt.id,
      other.id,
    ]);
    expect(await store.openAt('phone', 'nobody')).toEqual([]);
  });

  it('[NTF-6] closes an open prompt once, lets a withdrawal mark an answer unused, and knows an answer by its message', async () => {
    const prompt = promptOf();
    await store.open(prompt, AT);
    const answered: InteractionOutcome = {
      kind: 'answered',
      answer: {
        promptId: prompt.id,
        reply: { kind: 'choice', choiceId: 'male' },
        via: { channel: 'phone', ref: '77' },
      },
    };
    const withdrawn: InteractionOutcome = {
      kind: 'withdrawn',
      withdrawal: { promptId: prompt.id, reason: 'answered-elsewhere', note: 'at the terminal' },
    };
    expect(await store.close(prompt.id, answered, later(1))).toBe(true);
    expect(await store.close(prompt.id, answered, later(2))).toBe(false);
    expect((await store.answeredBy('phone', '77'))?.prompt.id).toBe(prompt.id);
    expect(await store.answeredBy('phone', '78')).toBeNull();

    expect(await store.close(prompt.id, withdrawn, later(3))).toBe(true);
    expect(await store.close(prompt.id, withdrawn, later(4))).toBe(false);
    expect(await store.find(prompt.id)).toMatchObject({
      state: 'withdrawn',
      outcome: withdrawn,
      closedAt: later(3),
    });

    await store.recordDelivery(prompt.id, 'phone', { address: 'chat-1', messageRef: '41' }, AT);
    const [delivery] = await store.deliveries(prompt.id);
    await store.markClosed(delivery?.id ?? '', later(5));
    expect((await store.deliveries(prompt.id))[0]?.closedAt).toEqual(later(5));
  });

  it('[NTF-6] lists the open prompts past their time, and purges the long-closed ones with their deliveries', async () => {
    const soon = promptOf({ expiresAt: later(60_000).toISOString() });
    const lasting = promptOf({ expiresAt: later(3_600_000).toISOString() });
    await store.open(soon, AT);
    await store.open(lasting, AT);
    await store.recordDelivery(soon.id, 'phone', { address: 'chat-1', messageRef: '41' }, AT);
    expect(await store.expired(later(30_000))).toEqual([]);
    expect((await store.expired(later(120_000))).map((record) => record.prompt.id)).toEqual([
      soon.id,
    ]);

    await store.close(
      soon.id,
      { kind: 'withdrawn', withdrawal: { promptId: soon.id, reason: 'expired', note: null } },
      later(120_000),
    );
    expect(await store.purgeClosed(later(120_000))).toBe(0);
    expect(await store.purgeClosed(later(120_001))).toBe(1);
    expect(await store.find(soon.id)).toBeNull();
    expect(await store.deliveries(soon.id)).toEqual([]);
    expect(await store.find(lasting.id)).not.toBeNull();
  });
});
