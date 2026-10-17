/**
 * A message's text from the parts Gmail returns: the plain part where there
 * is one, else the HTML part reduced to text. Bodies arrive base64url-encoded;
 * a part's children are walked in order, so a multipart/alternative yields
 * its plain alternative first.
 */
export interface MimePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MimePart[];
}

export interface Header {
  name: string;
  value: string;
}

/** The header's value, matched without regard to case; null when the message carries none. */
export const headerOf = (headers: readonly Header[] | undefined, name: string): string | null =>
  headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? null;

/** Every part of the tree, the root first, children in order. */
const partsOf = (part: MimePart): MimePart[] => [part, ...(part.parts ?? []).flatMap(partsOf)];

const decode = (data: string): string => Buffer.from(data, 'base64url').toString('utf8');

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Character references as the characters they name; one the table does not name stays as written. */
const decodeEntities = (text: string): string =>
  text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });

/** HTML as text: what a person reads, with the markup, the styles and the scripts gone and the entities decoded. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Characters that draw nothing: Unicode's format characters (zero-width
 * spaces and joiners, soft hyphens, byte-order marks) and the combining
 * grapheme joiner, which a message's preview padding is often made of.
 */
const INVISIBLE = /[\p{Cf}͏]/gu;

/** A snippet as a person reads it: Gmail writes its snippets HTML-escaped; decoded, invisible characters gone, spacing collapsed. */
export const snippetOf = (snippet: string | undefined): string =>
  decodeEntities(snippet ?? '')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The message's text: its first plain part, else its first HTML part as text, else nothing. */
export function textOf(payload: MimePart | undefined): string {
  if (payload === undefined) return '';
  const parts = partsOf(payload);
  const typed = (type: string): MimePart | undefined =>
    parts.find((part) => part.mimeType?.toLowerCase() === type && part.body?.data !== undefined);
  const plain = typed('text/plain');
  if (plain?.body?.data !== undefined) return decode(plain.body.data).trim();
  const html = typed('text/html');
  if (html?.body?.data !== undefined) return htmlToText(decode(html.body.data));
  return '';
}

/** Addresses as a header lists them: split on commas outside quotes and angle brackets, each trimmed. */
export function addressesOf(header: string | null): string[] {
  if (header === null) return [];
  const found: string[] = [];
  let current = '';
  let quoted = false;
  let angled = 0;
  for (const char of header) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === '<') angled += 1;
    if (!quoted && char === '>') angled = Math.max(0, angled - 1);
    if (char === ',' && !quoted && angled === 0) {
      found.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  found.push(current);
  return found.map((each) => each.trim()).filter((each) => each !== '');
}

/** The bare address of the first mailbox a header names — what is inside its angle brackets, else the whole — lower-cased; null for none. */
export function addressOf(header: string | null): string | null {
  const [first] = addressesOf(header);
  if (first === undefined) return null;
  const open = first.lastIndexOf('<');
  const close = first.lastIndexOf('>');
  const bare = open !== -1 && close > open ? first.slice(open + 1, close) : first;
  return bare.trim().toLowerCase();
}
