import { describe, expect, it } from 'vitest';

import { proveApiDatabase } from '../packages/studio-e2e/src/support/api-database-proof';
import {
  BASE_PORTS,
  e2ePortsFor,
  LANE_PORT_SETS,
  lanePortOffset,
} from '../packages/studio-e2e/src/support/lane-ports';

/**
 * The e2e suite's servers are its lane's alone.
 *
 * Playwright reuses whatever answers on a configured port, so a port two
 * checkouts share is a server one of them did not start — writing into the
 * other's database. The ports are therefore derived from the suite's
 * database: the same lane always gets the same ports, a different lane gets
 * its own, and no lane's ports can be a developer's server or another of the
 * suite's own. When two lane names do hash alike, the global setup's proof
 * refuses the run: the API it found must read the suite's database.
 */

/** Every port a developer's stack binds: the APIs, the loop, govcon, notifications, job-application, the web clients, the marketing site's dev server, Postgres, Qdrant. */
const DEV_PORTS = [3000, 3003, 3004, 3005, 3006, 4200, 4201, 4202, 4203, 5433, 6333];

const SERVERS = Object.keys(BASE_PORTS) as (keyof typeof BASE_PORTS)[];

describe('e2e lane ports', () => {
  it('keeps the test database on the documented ports', () => {
    expect(e2ePortsFor('sysdesign_test')).toEqual({ api: 3200, ui: 4300, grader: 3103 });
  });

  it('derives a lane its own ports, the same on every call', () => {
    const recall = e2ePortsFor('sysdesign_test_recall');
    expect(e2ePortsFor('sysdesign_test_recall')).toEqual(recall);
    expect(recall).not.toEqual(e2ePortsFor('sysdesign_test'));
    // One offset moves all three, so a lane's UI is built against its own API.
    const offset = lanePortOffset('sysdesign_test_recall');
    expect(offset).toBeGreaterThan(0);
    expect(recall).toEqual({
      api: BASE_PORTS.api + offset,
      ui: BASE_PORTS.ui + offset,
      grader: BASE_PORTS.grader + offset,
    });
  });

  it('gives distinct lanes distinct ports', () => {
    const lanes = ['recall', 'ci', 'ci_2', 'review', 'main'];
    const offsets = lanes.map((lane) => lanePortOffset(`sysdesign_test_${lane}`));
    expect(new Set(offsets).size).toBe(lanes.length);
  });

  it('never lands a lane on a dev server, or two servers of the suite on one port', () => {
    const taken = new Map<number, string>();
    for (let offset = 0; offset < LANE_PORT_SETS; offset++) {
      for (const server of SERVERS) {
        const port = BASE_PORTS[server] + offset;
        expect(DEV_PORTS, `${server} at offset ${offset}`).not.toContain(port);
        // A port belongs to one server at one offset across every lane.
        expect(taken.get(port), `port ${port}`).toBeUndefined();
        taken.set(port, `${server}+${offset}`);
      }
    }
    // Every offset a lane can be given is within the declared sets.
    for (const lane of ['a', 'recall', 'z_9', 'a_very_long_lane_name_for_a_parallel_job']) {
      const offset = lanePortOffset(`sysdesign_test_${lane}`);
      expect(offset).toBeGreaterThanOrEqual(1);
      expect(offset).toBeLessThan(LANE_PORT_SETS);
    }
  });

  it('refuses a database that is not a test one', () => {
    expect(() => e2ePortsFor('sysdesign')).toThrow(/Refusing .* database "sysdesign"/);
  });
});

describe('the proof that the API under test reads the suite database', () => {
  const stack = {
    apiUrl: 'http://localhost:3281/api',
    ports: e2ePortsFor('sysdesign_test_recall'),
    database: 'sysdesign_test_recall',
  };

  /**
   * The suite's database, keeping the stories planted in it by id, and an API
   * that answers `status` — reading that database when `shared`, another
   * lane's (which holds none of them) when not. Every request the API is sent
   * is kept, so a write can be seen.
   */
  const world = (status: number, shared: boolean) => {
    const suite = new Map<string, string>();
    const statements: string[] = [];
    const db = {
      query: async (sql: string, values: unknown[]) => {
        statements.push(sql.split(' ')[0] ?? '');
        if (sql.startsWith('insert')) suite.set(String(values[0]), String(values[1]));
        else suite.delete(String(values[0]));
      },
    };
    const sent: { url: string; method: string; body: unknown }[] = [];
    const send = (async (url: string, init?: RequestInit) => {
      sent.push({ url, method: init?.method ?? 'GET', body: init?.body ?? null });
      const title = shared ? suite.get(url.split('/').at(-1) ?? '') : undefined;
      if (status !== 200) return new Response(null, { status });
      if (title === undefined) return new Response(null, { status: 404 });
      return Response.json({ data: { title } });
    }) as typeof fetch;
    return { db, send, sent, suite, statements };
  };

  it('passes when the API answers the story planted in the suite database, then removes it', async () => {
    const { db, send, sent, suite, statements } = world(200, true);
    await expect(proveApiDatabase(stack, db, send)).resolves.toBeUndefined();
    expect(sent).toEqual([
      {
        url: expect.stringMatching(/^http:\/\/localhost:3281\/api\/star-stories\/[\w-]+$/),
        method: 'GET',
        body: null,
      },
    ]);
    expect(statements).toEqual(['insert', 'delete']);
    expect(suite.size).toBe(0);
  });

  it('refuses another lane’s API, naming the database and the ports to free, having sent it only a read', async () => {
    const { db, send, sent, suite } = world(200, false);
    await expect(proveApiDatabase(stack, db, send)).rejects.toThrow(
      /does not read "sysdesign_test_recall".*:3281, :4381 and :3184/s,
    );
    expect(sent.map((request) => [request.method, request.body])).toEqual([['GET', null]]);
    expect(suite.size).toBe(0);
  });

  it('refuses an API that will not answer, and still removes the probe', async () => {
    const { db, send, suite } = world(503, true);
    await expect(proveApiDatabase(stack, db, send)).rejects.toThrow(
      /refused the lane proof \(503\)/,
    );
    expect(suite.size).toBe(0);
  });
});
