import { GMAIL_TOPICS } from '@sysdesign/contracts';
import { ToolCatalog } from '@sysdesign/tool-session';
import { FakeEvents } from '@sysdesign/tool-session/testing';

import { InMemoryMailbox, sampleMessage } from '../mailbox/testing';
import { gmailTools } from './catalog';

const settings = {
  searchMax: 10,
  searchCeiling: 25,
  bodyMaxLength: 20,
  messageInThreadMaxLength: 30,
  recovery: { windowMs: 0, pauseMs: 1 },
};

const catalogOf = (mailbox = new InMemoryMailbox([sampleMessage({ id: 'm1' })])) => {
  const events = new FakeEvents();
  return { catalog: new ToolCatalog(gmailTools(mailbox, settings, events)), events, mailbox };
};

describe('the mailbox tools', () => {
  it('[GML-5] declares the ten tools once — three reads, six writes that reach nobody, none asking first — with the mailbox as their provider', () => {
    const { catalog } = catalogOf();
    expect(catalog.declarations().map((tool) => [tool.name, tool.effect, tool.approval])).toEqual([
      ['search_threads', 'read', false],
      ['get_message', 'read', false],
      ['get_thread', 'read', false],
      ['create_draft', 'write', false],
      ['list_drafts', 'read', false],
      ['list_labels', 'read', false],
      ['label_message', 'write', false],
      ['label_thread', 'write', false],
      ['unlabel_message', 'write', false],
      ['unlabel_thread', 'write', false],
    ]);
    expect(catalog.declarations().every((tool) => tool.provider === 'gmail')).toBe(true);
    expect(catalog.declaration('search_threads')?.parameters['required']).toEqual(['query', 'max']);
  });

  it('[GML-5] answers in words a plan reads, with the ids a later call takes, and reads a missing message or thread as a refusal', async () => {
    const { catalog } = catalogOf();
    const search = await catalog.execute('search_threads', { query: 'lunch', max: null });
    expect(search.outcome).toBe('ok');
    expect(search.summary).toBe(
      '- thread t1 · 2026-10-15 09:00 · Ada Example <ada@example.test> · "Lunch next week?" · 1 message · Would Tuesday or Thursday work for you?',
    );
    const read = await catalog.execute('get_message', { id: 'm1' });
    expect(read.summary).toContain('message m1 · thread t1\nFrom: Ada Example <ada@example.test>');
    expect(read.summary).toContain('Labels: INBOX, UNREAD');
    expect(read.summary.endsWith('…')).toBe(true);
    const thread = await catalog.execute('get_thread', { id: 't1' });
    expect(thread.summary).toContain('thread t1 · 1 message');
    expect(await catalog.execute('get_message', { id: 'nope' })).toMatchObject({
      outcome: 'refused',
      summary: 'no message nope',
    });
    expect(await catalog.execute('get_thread', { id: 'nope' })).toMatchObject({
      outcome: 'refused',
    });
    expect(
      (await catalog.execute('search_threads', { query: 'nothing-here', max: null })).summary,
    ).toBe('No thread matches.');
    expect((await catalog.execute('list_labels', {})).summary).toContain('- Clients (user)');
  });

  it('[GML-5] drafts a reply in its thread — never sends — and says so on the bus; a new draft needs a recipient', async () => {
    const { catalog, events, mailbox } = catalogOf();
    const drafted = await catalog.execute('create_draft', {
      to: [],
      cc: [],
      subject: '',
      body: 'Tuesday works.',
      replyToMessageId: 'm1',
    });
    expect(drafted.outcome).toBe('ok');
    expect(drafted.summary).toMatch(
      /^Drafted, not sent: draft d\d+ · to Ada Example <ada@example.test> · "Re: Lunch next week\?" · in thread t1$/,
    );
    expect(mailbox.drafts).toHaveLength(1);
    expect(events.published).toEqual([
      {
        topic: GMAIL_TOPICS.draftCreated,
        payload: expect.objectContaining({
          threadId: 't1',
          to: ['Ada Example <ada@example.test>'],
        }),
      },
    ]);
    expect(
      await catalog.execute('create_draft', {
        to: [],
        cc: [],
        subject: 'Hi',
        body: 'x',
        replyToMessageId: null,
      }),
    ).toMatchObject({
      outcome: 'refused',
      summary: 'a new draft needs at least one recipient',
    });
    expect((await catalog.execute('list_drafts', { max: null })).summary).toMatch(
      /^- draft d\d+ · to Ada Example/,
    );
  });

  it('[GML-5] puts labels on and takes them off by name, says each change on the bus, and reads an unknown label as a refusal', async () => {
    const { catalog, events, mailbox } = catalogOf();
    expect(await catalog.execute('label_message', { id: 'm1', label: 'clients' })).toMatchObject({
      outcome: 'ok',
      summary: 'message m1 now carries: INBOX, UNREAD, Clients',
    });
    expect(await catalog.execute('unlabel_thread', { id: 't1', label: 'UNREAD' })).toMatchObject({
      summary: 'thread t1 now carries: INBOX, Clients',
    });
    expect(mailbox.messages[0]?.labels).toEqual(['INBOX', 'Clients']);
    expect(
      events.published.map((event) => [event.topic, (event.payload as { target: string }).target]),
    ).toEqual([
      [GMAIL_TOPICS.labelsChanged, 'message'],
      [GMAIL_TOPICS.labelsChanged, 'thread'],
    ]);
    expect(await catalog.execute('label_thread', { id: 't1', label: 'Nope' })).toMatchObject({
      outcome: 'refused',
      summary: 'no label "Nope": list_labels names the labels there are',
    });
    expect(await catalog.execute('unlabel_message', { id: 'nope', label: 'INBOX' })).toMatchObject({
      outcome: 'failed',
    });
  });
});
