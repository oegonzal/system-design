import { matchRoute, ROUTES_SCHEMA, type Route } from './routes';

/** The declared routes, in an order that proves order carries no meaning. */
const ROUTES: Route[] = ROUTES_SCHEMA.parse([
  { prefix: '/', port: 4200 },
  { prefix: '/govcon', port: 4202 },
  { prefix: '/api', port: 3000, api: true },
  { prefix: '/govcon-api', port: 3004, strip: true, api: true },
  { prefix: '/loop', port: 3003, strip: true, api: true },
  { prefix: '/inspector', port: 4201 },
]);

const matched = (path: string) => {
  const match = matchRoute(ROUTES, path);
  return match === undefined ? undefined : [match.route.port, match.upstreamPath];
};

describe('the declared routes', () => {
  it('matches a prefix on the path itself or a path below it, longest prefix first', () => {
    expect(matched('/')).toEqual([4200, '/']);
    expect(matched('/prompts/1')).toEqual([4200, '/prompts/1']);
    expect(matched('/api')).toEqual([3000, '/api']);
    expect(matched('/api/health')).toEqual([3000, '/api/health']);
    expect(matched('/inspector/runs')).toEqual([4201, '/inspector/runs']);
  });

  it('never reads /govcon-api as below /govcon, nor a longer word as the prefix it starts with', () => {
    expect(matched('/govcon')).toEqual([4202, '/govcon']);
    expect(matched('/govcon/primes/1')).toEqual([4202, '/govcon/primes/1']);
    expect(matched('/govcon-api/awards')).toEqual([3004, '/awards']);
    expect(matched('/govcon-apix')).toEqual([4200, '/govcon-apix']);
    expect(matched('/apix')).toEqual([4200, '/apix']);
  });

  it('strips a prefix keeping a leading slash, and never strips the root', () => {
    expect(matched('/loop')).toEqual([3003, '/']);
    expect(matched('/loop/runs')).toEqual([3003, '/runs']);
    expect(matchRoute(ROUTES_SCHEMA.parse([{ prefix: '/', port: 1, strip: true }]), '/a')).toEqual({
      route: { prefix: '/', port: 1, strip: true },
      upstreamPath: '/a',
    });
  });

  it('carries the flags a route declares, and nothing it does not', () => {
    const [route] = ROUTES_SCHEMA.parse([{ prefix: '/_next/static', port: 4200, public: true }]);
    expect(route).toEqual({ prefix: '/_next/static', port: 4200, public: true });
    expect(matchRoute(ROUTES, '/_next/static/chunk.js')?.route.public).toBeUndefined();
  });

  it('matches nothing when no declared prefix covers the path', () => {
    const withoutRoot = ROUTES.filter((route) => route.prefix !== '/');
    expect(matchRoute(withoutRoot, '/elsewhere')).toBeUndefined();
    expect(matchRoute(withoutRoot, '/api/x')?.route.port).toBe(3000);
  });

  it.each([
    ['an empty list', []],
    ['a prefix without a leading slash', [{ prefix: 'api', port: 3000 }]],
    ['a prefix with a trailing slash', [{ prefix: '/api/', port: 3000 }]],
    ['a prefix with an empty segment', [{ prefix: '/api//v1', port: 3000 }]],
    ['a port that is not one', [{ prefix: '/api', port: 0 }]],
    ['a key the shape does not declare', [{ prefix: '/api', port: 3000, host: 'x' }]],
    [
      'a prefix declared twice',
      [
        { prefix: '/api', port: 3000 },
        { prefix: '/api', port: 3001 },
      ],
    ],
  ])('refuses %s', (_case, routes) => {
    expect(ROUTES_SCHEMA.safeParse(routes).success).toBe(false);
  });
});
