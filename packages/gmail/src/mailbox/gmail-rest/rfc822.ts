/**
 * A draft as Gmail takes it: one RFC 822 message, base64url-encoded. A reply
 * carries the headers that thread it under the message it answers.
 */
export interface OutgoingMessage {
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  body: string;
  /** The `Message-ID` of the message replied to, for `In-Reply-To` and `References`. */
  inReplyTo: string | null;
  /** The `References` of the message replied to, extended with its own id. */
  references: string | null;
}

/** A header value with no line breaks, so a value can never smuggle a header. */
const oneLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

/** A header value that is not ASCII, encoded as RFC 2047 says; one that is, as written. */
export const encodedWord = (value: string): string =>
  /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/** The subject a reply carries: the original's, prefixed once. */
export const replySubject = (subject: string): string =>
  /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;

/** The raw message, base64url-encoded as the drafts endpoint takes it. */
export function rawMessage(message: OutgoingMessage): string {
  const headers = [
    `To: ${oneLine(message.to.join(', '))}`,
    ...(message.cc.length === 0 ? [] : [`Cc: ${oneLine(message.cc.join(', '))}`]),
    `Subject: ${encodedWord(oneLine(message.subject))}`,
    ...(message.inReplyTo === null ? [] : [`In-Reply-To: ${oneLine(message.inReplyTo)}`]),
    ...(message.inReplyTo === null
      ? []
      : [
          `References: ${oneLine(
            [message.references, message.inReplyTo].filter((each) => each !== null).join(' '),
          )}`,
        ]),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  const text = `${headers.join('\r\n')}\r\n\r\n${message.body.replace(/\r?\n/g, '\r\n')}`;
  return Buffer.from(text, 'utf8').toString('base64url');
}
