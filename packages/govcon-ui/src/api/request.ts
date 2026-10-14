import { createRequest } from '@sysdesign/web-kit';

/** Where the govcon service answers, the one request function every method goes through, and how a path segment is spelled. */
const BASE_URL = process.env['NEXT_PUBLIC_GOVCON_URL'] ?? 'http://localhost:3004';
export const request = createRequest(BASE_URL);
export const encode = encodeURIComponent;

/** A list on the wire: comma-joined, since a query string carries scalars; the server reads it back as a list. */
export const joined = (codes: readonly string[] | undefined): string | undefined =>
  codes && codes.length > 0 ? codes.join(',') : undefined;
