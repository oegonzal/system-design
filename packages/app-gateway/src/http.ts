import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/**
 * The Lambda function URL's request and response shapes (payload format
 * 2.0), and the few readings and answers every module shares: a header by
 * name, the cookies the browser sent, whether the caller wants HTML, and a
 * JSON, HTML or redirect answer. Nothing here knows a route, a session or an
 * upstream.
 */

export type GatewayEvent = APIGatewayProxyEventV2;
export type GatewayResult = APIGatewayProxyStructuredResultV2;

/** Function URL headers arrive lower-cased; a lookup never depends on the caller's spelling. */
export function header(event: GatewayEvent, name: string): string | undefined {
  return event.headers[name.toLowerCase()];
}

/** The cookies the request carries, by name; a malformed pair is ignored. */
export function readCookies(event: GatewayEvent): Readonly<Record<string, string>> {
  const cookies: Record<string, string> = {};
  for (const pair of event.cookies ?? []) {
    const at = pair.indexOf('=');
    if (at > 0) cookies[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }
  return cookies;
}

/** Whether the caller wants a page: its Accept names `text/html`. */
export function acceptsHtml(event: GatewayEvent): boolean {
  return (header(event, 'accept') ?? '').toLowerCase().includes('text/html');
}

/** The request's method, as the function URL names it. */
export function methodOf(event: GatewayEvent): string {
  return event.requestContext.http.method;
}

/** The body as bytes: the function URL carries one base64-encoded or as text, and says which. */
export function bodyOf(event: GatewayEvent): Buffer | undefined {
  return event.body === undefined
    ? undefined
    : Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
}

/** The fields of a form-encoded body; an absent body reads as no fields. */
export function readForm(event: GatewayEvent): URLSearchParams {
  return new URLSearchParams(bodyOf(event)?.toString('utf8') ?? '');
}

/** The request's path and query as one string, the way a return-to address is kept. */
export function pathWithQuery(event: GatewayEvent): string {
  return event.rawQueryString === '' ? event.rawPath : `${event.rawPath}?${event.rawQueryString}`;
}

type Headers = Readonly<Record<string, string>>;

export const NO_STORE: Headers = { 'cache-control': 'no-store' };

export function jsonResult(
  statusCode: number,
  body: unknown,
  headers: Headers = {},
): GatewayResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

export function htmlResult(statusCode: number, html: string, headers: Headers = {}): GatewayResult {
  return {
    statusCode,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
    body: html,
  };
}

export function redirectResult(location: string, cookies: readonly string[] = []): GatewayResult {
  return { statusCode: 302, headers: { location, ...NO_STORE }, cookies: [...cookies] };
}

/** The result with these cookies set beside any it already sets. */
export function withCookies(result: GatewayResult, cookies: readonly string[]): GatewayResult {
  return cookies.length === 0
    ? result
    : { ...result, cookies: [...(result.cookies ?? []), ...cookies] };
}

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The one page frame, styled inline: the gateway serves it with no assets of
 * its own. `main` and `head` are trusted markup the caller built — a form, a
 * `<meta>` — with every value of the viewer's already escaped.
 */
export function page(title: string, main: string, head = ''): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    head,
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;',
    'font-family:system-ui,sans-serif;background:#f6f7f9;color:#1f2933">',
    '<main style="max-width:28rem;padding:2rem;text-align:center">',
    `<h1 style="font-size:1.5rem;font-weight:600;margin:0 0 .75rem">${escapeHtml(title)}</h1>`,
    main,
    '</main></body></html>',
  ].join('');
}

/** A one-message page. */
export function messagePage(title: string, message: string, head = ''): string {
  return page(title, `<p style="margin:0;line-height:1.5">${escapeHtml(message)}</p>`, head);
}
