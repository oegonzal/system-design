/**
 * SAM.gov returns a notice's description as HTML. Nothing downstream renders
 * markup — the CLI prints text, the web client renders text nodes — so the
 * adapter reduces it to text once, at fetch time, the way `normalize.ts`
 * reduces the provider's three date spellings. Presentation normalization,
 * driven by two tables: which tags end a line, and which named entities are
 * spelled out. Anything unforeseen degrades to an odd-looking line, never to
 * markup reaching a screen.
 */
const BLOCK_TAGS = [
  'p',
  'div',
  'br',
  'li',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'table',
  'section',
  'article',
  'blockquote',
  'pre',
  'hr',
] as const;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
};

/** Cells sit side by side: a space keeps their words apart. */
const CELL_TAGS = ['td', 'th'] as const;

const DROPPED_ELEMENTS = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_BOUNDARY = new RegExp(`</?(?:${BLOCK_TAGS.join('|')})\\b[^>]*>`, 'gi');
const CELL_BOUNDARY = new RegExp(`</?(?:${CELL_TAGS.join('|')})\\b[^>]*>`, 'gi');
const INLINE_TAG = /<\/?[a-z][^>]*>/gi;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

const decodeEntity = (match: string, body: string): string => {
  if (body.startsWith('#')) {
    const code =
      body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : match;
  }
  return ENTITIES[body.toLowerCase()] ?? match;
};

/**
 * Markup → readable text: block tags end a line, cells become a space, inline
 * tags vanish (`<em>word</em>` is just the word), entities are spelled out and
 * whitespace is tidy — one line per block, no blank lines. Text the provider
 * escaped (`&lt;`) stays text, which is the point.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/\r\n?/g, '\n')
    .replace(DROPPED_ELEMENTS, ' ')
    .replace(BLOCK_BOUNDARY, '\n')
    .replace(CELL_BOUNDARY, ' ')
    .replace(INLINE_TAG, '')
    .replace(ENTITY, decodeEntity)
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}
