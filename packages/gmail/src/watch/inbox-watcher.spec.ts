import { GMAIL_TOPICS, INTERACTION_TOPICS, interactionPromptSchema } from '@sysdesign/contracts';

import type { HistoryPage } from '../mailbox';
import { InMemoryMailbox, sampleMessage } from '../mailbox/testing';
import { InboxWatcher } from './inbox-watcher';

const settings = { enabled: true, pollEveryMs: 60_000, noticeTtlMs: 3_600_000 };
const quiet = { info: () => undefined, warn: () => undefined };

type Published = { topic: string; source: string; payload: unknown };

/** A bus that records every publish and refuses the one numbered `failAt`, once. */
const recordingBus = (failAt: number | null = null) => {
  const published: Published[] = [];
  let failed = false;
  return {
    published,
    publish: (request: Published) => {
      published.push(request);
      if (failAt !== null && !failed && published.length === failAt) {
        failed = true;
        return Promise.reject(new Error('bus down'));
      }
      return Promise.resolve({ seq: '1', ...request, publishedAt: '' });
    },
  };
};

const watching = (mailbox: InMemoryMailbox, failAt: number | null = null) => {
  const bus = recordingBus(failAt);
  const watcher = new InboxWatcher(
    mailbox,
    bus,
    settings,
    quiet,
    () => new Date('2026-10-16T12:00:00.000Z'),
  );
  return { watcher, published: bus.published };
};

/** A mailbox whose history answers only when the spec says. */
class SlowMailbox extends InMemoryMailbox {
  release: (() => void) | null = null;
  override history(startHistoryId: string): Promise<HistoryPage | null> {
    const page = super.history(startHistoryId);
    return new Promise((resolve) => {
      this.release = () => resolve(page);
    });
  }
}

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
    // The account's address inside another's is another's: told.
    mailbox.receive(
      sampleMessage({ id: 'm5', from: 'Not Me <notowner@example.test>', subject: 'Also mail' }),
    );
    // What the mailbox marks as sent is the account's, whatever the header says: not told.
    mailbox.receive(
      sampleMessage({ id: 'm6', from: 'Alias <alias@x.test>', labels: ['INBOX', 'SENT'] }),
    );
    const arrivals = await watcher.poll();
    expect(arrivals.map((message) => message.id)).toEqual(['m2', 'm4', 'm5']);
    expect(published.map((event) => event.topic)).toEqual([
      GMAIL_TOPICS.messageReceived,
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
    const notice = interactionPromptSchema.parse(published[3]?.payload);
    expect(notice.title).toBe('3 new messages');
    expect(notice.details).toEqual([
      'Bob <bob@example.test> — Invoice (message m2)',
      'Cy <cy@example.test> — (no subject) (message m4)',
      'Not Me <notowner@example.test> — Also mail (message m5)',
    ]);
    expect(notice.choices.map((choice) => choice.id)).toEqual(['noted']);
    expect(notice.expiresAt).toBe('2026-10-16T13:00:00.000Z');
    // Told once: the next poll finds nothing new.
    expect(await watcher.poll()).toEqual([]);
    expect(published).toHaveLength(4);
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

  it('[GML-6] runs one poll at a time: a tick that lands while one runs joins it, and nothing is told twice', async () => {
    const mailbox = new SlowMailbox();
    const { watcher, published } = watching(mailbox);
    await watcher.start();
    mailbox.receive(sampleMessage({ id: 'm1', from: 'Bob <bob@example.test>' }));
    const first = watcher.poll();
    const second = watcher.poll();
    expect(second).toBe(first);
    mailbox.release?.();
    expect((await first).map((message) => message.id)).toEqual(['m1']);
    expect(published.map((event) => event.topic)).toEqual([
      GMAIL_TOPICS.messageReceived,
      INTERACTION_TOPICS.prompted,
    ]);
  });

  it('[GML-6] a poll that fails midway starts again from the same place and tells what it had not', async () => {
    const mailbox = new InMemoryMailbox();
    const { watcher, published } = watching(mailbox, 2);
    await watcher.start();
    mailbox.receive(sampleMessage({ id: 'm1', from: 'Bob <bob@example.test>', subject: 'One' }));
    mailbox.receive(sampleMessage({ id: 'm2', from: 'Cy <cy@example.test>', subject: 'Two' }));
    await expect(watcher.poll()).rejects.toThrow('bus down');
    expect(published.map((event) => event.topic)).toEqual([
      GMAIL_TOPICS.messageReceived,
      GMAIL_TOPICS.messageReceived,
    ]);
    const retried = await watcher.poll();
    expect(retried.map((message) => message.id)).toEqual(['m1', 'm2']);
    const notice = interactionPromptSchema.parse(published.at(-1)?.payload);
    expect(notice.title).toBe('2 new messages');
    expect(await watcher.poll()).toEqual([]);
  });
});
