import { fakeGoogleFetch, FakeTokenSource, googleError, json } from '@sysdesign/google-kit/testing';

import { LabelUnknown } from '../ports';
import { GMAIL_API, GmailRest } from './client';

const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

const headers = (values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));

const message = (id: string, threadId: string, extra: Record<string, string> = {}) => ({
  id,
  threadId,
  labelIds: ['INBOX', 'UNREAD'],
  snippet: 'Would Tuesday work?',
  internalDate: '1760605200000',
  payload: {
    mimeType: 'multipart/alternative',
    headers: headers({
      From: 'Ada <ada@x.test>',
      To: 'owner@x.test, bob@x.test',
      Subject: 'Lunch',
      Date: 'Thu, 16 Oct 2026 09:00:00 +0000',
      'Message-ID': `<${id}@x.test>`,
      ...extra,
    }),
    parts: [{ mimeType: 'text/plain', body: { data: b64('Would Tuesday work?\n') } }],
  },
});

const LABELS = [
  { id: 'INBOX', name: 'INBOX', type: 'system' },
  { id: 'Label_7', name: 'Clients', type: 'user' },
];

describe('the Gmail REST adapter', () => {
  it('[GML-4] lists a search’s threads from their messages’ headers, reads a message and a thread whole, and answers null for one Gmail does not have', async () => {
    const google = fakeGoogleFetch({
      [`GET ${GMAIL_API}/threads`]: () => json({ threads: [{ id: 't1', snippet: 'snip' }] }),
      [`GET ${GMAIL_API}/threads/t1`]: () =>
        json({
          id: 't1',
          messages: [message('m1', 't1'), message('m2', 't1', { From: 'Bob <bob@x.test>' })],
        }),
      [`GET ${GMAIL_API}/messages/m1`]: () => json(message('m1', 't1')),
      [`GET ${GMAIL_API}/messages/nope`]: () =>
        googleError(404, 'notFound', 'Requested entity was not found.'),
    });
    const gmail = new GmailRest(new FakeTokenSource(), google.fetch);
    expect(await gmail.searchThreads('from:ada', 5)).toEqual([
      {
        id: 't1',
        subject: 'Lunch',
        from: 'Bob <bob@x.test>',
        messages: 2,
        date: '2026-10-16T09:00:00.000Z',
        snippet: 'snip',
      },
    ]);
    expect(google.calls[0]?.url.searchParams.get('q')).toBe('from:ada');
    expect(google.calls[0]?.url.searchParams.get('maxResults')).toBe('5');
    expect(google.calls[1]?.url.searchParams.get('format')).toBe('metadata');
    expect(await gmail.getMessage('m1')).toEqual({
      id: 'm1',
      threadId: 't1',
      from: 'Ada <ada@x.test>',
      to: ['owner@x.test', 'bob@x.test'],
      subject: 'Lunch',
      date: '2026-10-16T09:00:00.000Z',
      snippet: 'Would Tuesday work?',
      labels: ['INBOX', 'UNREAD'],
      body: 'Would Tuesday work?',
      messageIdHeader: '<m1@x.test>',
      references: null,
    });
    expect(await gmail.getMessage('nope')).toBeNull();
    expect((await gmail.getThread('t1'))?.messages.map((each) => each.id)).toEqual(['m1', 'm2']);
  });

  it('[GML-4] creates a draft in its thread with the original’s sender and subject by default, lists drafts, and refuses a reply to a message Gmail does not have', async () => {
    const google = fakeGoogleFetch({
      [`GET ${GMAIL_API}/messages/m1`]: () =>
        json(message('m1', 't1', { References: '<m0@x.test>' })),
      [`GET ${GMAIL_API}/messages/nope`]: () => googleError(404, 'notFound', 'nope'),
      [`POST ${GMAIL_API}/drafts`]: () =>
        json({ id: 'd1', message: { id: 'dm1', threadId: 't1' } }),
      [`GET ${GMAIL_API}/drafts`]: () => json({ drafts: [{ id: 'd1' }] }),
      [`GET ${GMAIL_API}/drafts/d1`]: () =>
        json({
          id: 'd1',
          message: {
            id: 'dm1',
            threadId: 't1',
            payload: { headers: headers({ To: 'Ada <ada@x.test>', Subject: 'Re: Lunch' }) },
          },
        }),
    });
    const gmail = new GmailRest(new FakeTokenSource(), google.fetch);
    const draft = await gmail.createDraft({
      to: [],
      cc: [],
      subject: '',
      body: 'Tuesday works.',
      replyToMessageId: 'm1',
    });
    expect(draft).toEqual({
      id: 'd1',
      messageId: 'dm1',
      threadId: 't1',
      to: ['Ada <ada@x.test>'],
      subject: 'Re: Lunch',
    });
    const posted = google.calls.find((call) => call.method === 'POST')?.body as {
      message: { raw: string; threadId: string };
    };
    expect(posted.message.threadId).toBe('t1');
    const raw = Buffer.from(posted.message.raw, 'base64url').toString('utf8');
    expect(raw).toContain('To: Ada <ada@x.test>\r\n');
    expect(raw).toContain('In-Reply-To: <m1@x.test>\r\n');
    expect(raw).toContain('References: <m0@x.test> <m1@x.test>\r\n');
    expect(await gmail.listDrafts(10)).toEqual([
      {
        id: 'd1',
        messageId: 'dm1',
        threadId: 't1',
        to: ['Ada <ada@x.test>'],
        subject: 'Re: Lunch',
      },
    ]);
    await expect(
      gmail.createDraft({ to: [], cc: [], subject: '', body: 'x', replyToMessageId: 'nope' }),
    ).rejects.toThrow('no message nope to reply to');
  });

  it('[GML-4] lists labels, changes them by name through the ids the list gives, refuses a name there is no label for, reads the profile and walks the history', async () => {
    const google = fakeGoogleFetch({
      [`GET ${GMAIL_API}/labels`]: () => json({ labels: LABELS }),
      [`POST ${GMAIL_API}/messages/m1/modify`]: () =>
        json({ id: 'm1', labelIds: ['INBOX', 'Label_7'] }),
      [`POST ${GMAIL_API}/threads/t1/modify`]: () =>
        json({ id: 't1', messages: [{ labelIds: ['INBOX'] }, { labelIds: ['Label_7'] }] }),
      [`GET ${GMAIL_API}/profile`]: () =>
        json({ emailAddress: 'owner@x.test', historyId: '500', messagesTotal: 9 }),
      [`GET ${GMAIL_API}/history`]: (call) =>
        call.url.searchParams.get('pageToken') === null
          ? json({
              history: [{ messagesAdded: [{ message: { id: 'm5' } }, { message: { id: 'm5' } }] }],
              historyId: '510',
              nextPageToken: 'p2',
            })
          : json({ history: [{ messagesAdded: [{ message: { id: 'm6' } }] }], historyId: '512' }),
    });
    const gmail = new GmailRest(new FakeTokenSource(), google.fetch);
    expect(await gmail.listLabels()).toEqual([
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'Label_7', name: 'Clients', type: 'user' },
    ]);
    expect(await gmail.modifyLabels('message', 'm1', ['clients'], [])).toEqual([
      'INBOX',
      'Clients',
    ]);
    const modified = google.calls.find((call) =>
      call.url.pathname.endsWith('/messages/m1/modify'),
    )?.body;
    expect(modified).toEqual({ addLabelIds: ['Label_7'], removeLabelIds: [] });
    expect(await gmail.modifyLabels('thread', 't1', [], ['Clients'])).toEqual(['INBOX', 'Clients']);
    await expect(gmail.modifyLabels('message', 'm1', ['Nope'], [])).rejects.toThrow(LabelUnknown);
    expect(await gmail.profile()).toEqual({ emailAddress: 'owner@x.test', historyId: '500' });
    expect(await gmail.history('500')).toEqual({ messagesAdded: ['m5', 'm6'], historyId: '512' });
    expect(google.calls.at(-2)?.url.searchParams.get('startHistoryId')).toBe('500');
    expect(google.calls.at(-2)?.url.searchParams.get('historyTypes')).toBe('messageAdded');
    google.routes[`GET ${GMAIL_API}/history`] = () => googleError(404, 'notFound', 'too old');
    expect(await gmail.history('1')).toBeNull();
  });
});
