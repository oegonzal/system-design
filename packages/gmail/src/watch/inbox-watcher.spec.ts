import { GMAIL_TOPICS, INTERACTION_TOPICS, interactionPromptSchema } from '@sysdesign/contracts';

import { InMemoryMailbox, sampleMessage } from '../mailbox/testing';
import { InboxWatcher } from './inbox-watcher';

const settings = { enabled: true, pollEveryMs: 60_000, noticeTtlMs: 3_600_000 };
const quiet = { info: () => undefined, warn: () => undefined };

const watching = (mailbox: InMemoryMailbox) => {
  const published: { topic: string; source: string; payload: unknown }[] = [];
  const bus = {
    publish: (request: { topic: string; source: string; payload: unknown }) => {
      published.push(request);
      return Promise.resolve({ seq: '1', ...request, publishedAt: '' });
    },
  };
  const watcher = new InboxWatcher(
    mailbox,
    bus,
    settings,
    quiet,
    () => new Date('2026-10-16T12:00:00.000Z'),
  );
  return { watcher, published };
};

describe('the inbox watcher', () => {
  it('[GML-6] tells nothing older than where it started, says each arrival the account did not send on the bus, and tells a person of a poll’s arrivals in one notice', async () => {
    const mailbox = new InMemoryMailbox([sampleMessage({ id: 'old' })]);
    const { watcher, published } = watching(mailbox);
    await watcher.start();
    expect(await watcher.poll()).toEqual([]);
    expect(published).toEqual([]);
    mailbox.receive(
      sampleMessage({ id: 'm2', from: 'Bob <bob@example.test>', subject: 'Invoice' }),
    );
    mailbox.receive(
      sampleMessage({ id: 'm3', from: 'Me <owner@example.test>', subject: 'Note to self' }),
    );
    mailbox.receive(
      sampleMessage({ id: 'm4', from: 'Cy <cy@example.test>', subject: '', date: '' }),
    );
    const arrivals = await watcher.poll();
    expect(arrivals.map((message) => message.id)).toEqual(['m2', 'm4']);
    expect(published.map((event) => event.topic)).toEqual([
      GMAIL_TOPICS.messageReceived,
      GMAIL_TOPICS.messageReceived,
      INTERACTION_TOPICS.prompted,
    ]);
    expect(published[0]).toMatchObject({
      source: 'gmail',
      payload: {
        messageId: 'm2',
        threadId: 't1',
        from: 'Bob <bob@example.test>',
        subject: 'Invoice',
        receivedAt: '2026-10-15T09:00:00.000Z',
      },
    });
    expect(published[1]?.payload).toMatchObject({
      messageId: 'm4',
      receivedAt: '2026-10-16T12:00:00.000Z',
    });
    const notice = interactionPromptSchema.parse(published[2]?.payload);
    expect(notice.title).toBe('2 new messages');
    expect(notice.details).toEqual([
      'Bob <bob@example.test> — Invoice (message m2)',
      'Cy <cy@example.test> — (no subject) (message m4)',
    ]);
    expect(notice.choices.map((choice) => choice.id)).toEqual(['noted']);
    expect(notice.expiresAt).toBe('2026-10-16T13:00:00.000Z');
    // Told once: the next poll finds nothing new.
    expect(await watcher.poll()).toEqual([]);
    expect(published).toHaveLength(3);
    watcher.stop();
  });

  it('[GML-6] starts again from now when the mailbox will not answer from its history id, and does not run when the setting says so', async () => {
    const mailbox = new InMemoryMailbox();
    const { watcher, published } = watching(mailbox);
    await watcher.start();
    const before = (await mailbox.profile()).historyId;
    mailbox.staleHistoryIds.add(before);
    mailbox.receive(sampleMessage({ id: 'missed', from: 'Bob <bob@example.test>' }));
    expect(await watcher.poll()).toEqual([]);
    expect(published).toEqual([]);
    mailbox.receive(sampleMessage({ id: 'seen', from: 'Bob <bob@example.test>' }));
    expect((await watcher.poll()).map((message) => message.id)).toEqual(['seen']);
    watcher.stop();

    const off = new InboxWatcher(
      mailbox,
      { publish: () => Promise.reject(new Error('never')) },
      { ...settings, enabled: false },
      quiet,
    );
    await off.start();
    off.stop();
  });
});
