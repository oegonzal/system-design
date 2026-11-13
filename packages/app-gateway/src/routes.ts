import { z } from 'zod';

/**
 * The declared routes: which upstream port answers a path, read from
 * `GATEWAY_ROUTES` as JSON and never from the shape of a request. A prefix
 * matches the path itself or the path followed by `/` — `/govcon` never
 * matches `/govcon-api` — and the longest matching prefix wins, so the order
 * the routes are declared in carries no meaning. `strip` removes the prefix
 * before forwarding, keeping a leading `/`; `api` marks the routes answered
 * in JSON: 401 instead of a redirect to login, and the JSON "starting" answer
 * while the stack wakes; `public` marks the routes the session gate lets
 * through without a sign-in — the paths CloudFront caches without cookies
 * (a web app's hashed static assets) and a health path a deploy checks.
 */

/** The prefix the gateway answers itself — the sign-in routes — which no declared route may cover. */
export const AUTH_PREFIX = '/auth';

/** A prefix is `/`, or `/segment(/segment)*`: it starts with `/`, never ends with one, and has no empty segment. */
const PREFIX_SHAPE = /^\/(?:[^/]+(?:\/[^/]+)*)?$/;

const ROUTE_SCHEMA = z.strictObject({
  prefix: z.string().regex(PREFIX_SHAPE, 'a prefix starts with "/" and does not end with one'),
  port: z.int().min(1).max(65_535),
  strip: z.boolean().optional(),
  api: z.boolean().optional(),
  public: z.boolean().optional(),
});

export type Route = z.infer<typeof ROUTE_SCHEMA>;

export const ROUTES_SCHEMA = z
  .array(ROUTE_SCHEMA)
  .min(1)
  .refine((routes) => new Set(routes.map((route) => route.prefix)).size === routes.length, {
    message: 'each prefix is declared once',
  });

/** Whether `prefix` covers `path`: the path itself, or any path below it. */
export function prefixCovers(prefix: string, path: string): boolean {
  if (prefix === '/') return path.startsWith('/');
  return path === prefix || path.startsWith(`${prefix}/`);
}

interface RouteMatch {
  route: Route;
  /** The path the upstream receives: the request's, less the prefix when the route strips it. */
  upstreamPath: string;
}

/** The longest declared prefix covering `path`, or none when no route does. */
export function matchRoute(routes: readonly Route[], path: string): RouteMatch | undefined {
  const [route] = routes
    .filter((candidate) => prefixCovers(candidate.prefix, path))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  if (route === undefined) return undefined;
  const stripped = route.strip === true && route.prefix !== '/';
  return { route, upstreamPath: stripped ? path.slice(route.prefix.length) || '/' : path };
}
