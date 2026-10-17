import { addressesOf, headerOf, htmlToText, snippetOf, textOf } from './mime';
import { encodedWord, rawMessage, replySubject } from './rfc822';

const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

describe('a message’s text and a draft’s bytes', () => {
  it('[GML-3] takes the plain part first, else the HTML part as a person reads it, else nothing, and reads headers without regard to case', () => {
    const alternative = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: b64('<p>Hi <b>there</b></p>') } },
        { mimeType: 'text/plain', body: { data: b64('Hi there\n') } },
      ],
    };
    expect(textOf(alternative)).toBe('Hi there');
    expect(
      textOf({
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/html',
            body: {
              data: b64('<div>One</div><div>Two &amp; three &#x27;x&#39;</div><style>p{}</style>'),
            },
          },
        ],
      }),
    ).toBe("One\nTwo & three 'x'");
    expect(textOf({ mimeType: 'text/plain', body: { data: b64('  single  ') } })).toBe('single');
    expect(textOf({ mimeType: 'image/png', body: { size: 3 } })).toBe('');
    expect(textOf(undefined)).toBe('');
    expect(htmlToText('a<br>b<br/>c<script>x()</script>')).toBe('a\nb\nc');
    const headers = [
      { name: 'Subject', value: 'Hello' },
      { name: 'from', value: 'a@b' },
    ];
    expect(headerOf(headers, 'subject')).toBe('Hello');
    expect(headerOf(headers, 'FROM')).toBe('a@b');
    expect(headerOf(headers, 'To')).toBeNull();
  });

  it('[GML-3] reads a snippet as a person reads it: Gmail escapes it as HTML, and a preview is often padded with characters that draw nothing', () => {
    expect(
      snippetOf('Bowling, climbing &amp; more, easier on the wallet \u034F \u200C \u034F \u200C'),
    ).toBe('Bowling, climbing & more, easier on the wallet');
    expect(snippetOf('It&#39;s   here\u00AD\uFEFF &lt;soon&gt;')).toBe("It's here <soon>");
    expect(snippetOf(undefined)).toBe('');
  });

  it('[GML-3] reads addresses as a header lists them, commas inside quotes and brackets kept', () => {
    expect(addressesOf('"Doe, Jane" <jane@x.test>, bob@x.test , <c@x.test>')).toEqual([
      '"Doe, Jane" <jane@x.test>',
      'bob@x.test',
      '<c@x.test>',
    ]);
    expect(addressesOf(null)).toEqual([]);
    expect(addressesOf('')).toEqual([]);
  });

  it('[GML-3] builds one RFC 822 message base64url-encoded: a reply threaded under the original, the subject prefixed once and encoded when it must be, no header carrying a line break', () => {
    const raw = rawMessage({
      to: ['a@x.test', 'b@x.test'],
      cc: [],
      subject: 'Re: Lunch',
      body: 'Yes\nplease',
      inReplyTo: '<m1@x.test>',
      references: '<m0@x.test>',
    });
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    expect(text.split('\r\n\r\n')[0]?.split('\r\n')).toEqual([
      'To: a@x.test, b@x.test',
      'Subject: Re: Lunch',
      'In-Reply-To: <m1@x.test>',
      'References: <m0@x.test> <m1@x.test>',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
    ]);
    expect(text.split('\r\n\r\n')[1]).toBe('Yes\r\nplease');
    const fresh = Buffer.from(
      rawMessage({
        to: ['a@x.test'],
        cc: ['c@x.test'],
        subject: 'Hi\r\nBcc: evil@x.test',
        body: 'x',
        inReplyTo: null,
        references: null,
      }),
      'base64url',
    ).toString('utf8');
    expect(fresh).toContain('Cc: c@x.test\r\n');
    expect(fresh).toContain('Subject: Hi Bcc: evil@x.test\r\n');
    expect(fresh).not.toContain('In-Reply-To');
    expect(encodedWord('Réunion')).toBe('=?UTF-8?B?UsOpdW5pb24=?=');
    expect(encodedWord('Plain')).toBe('Plain');
    expect(replySubject('Lunch')).toBe('Re: Lunch');
    expect(replySubject('RE: Lunch ')).toBe('RE: Lunch');
  });
});
