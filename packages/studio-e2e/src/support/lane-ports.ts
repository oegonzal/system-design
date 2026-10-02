import { testDatabaseLane } from '@sysdesign/db/test-database';

/**
 * Which ports a suite on a given database runs its servers on — pure, and
 * read by `stack.ts` for the suite's own database. A checkout on
 * `sysdesign_test_<lane>` gets ports of its own beside one on
 * `sysdesign_test`, so two lanes never reuse each other's servers and can run
 * at once.
 */

/** The test database's own ports; a lane's sit a fixed offset above them. */
export const BASE_PORTS = {
  /** The studio API under test. */
  api: 3200,
  /** The studio UI under test, built against that API. */
  ui: 4300,
  /** The stub quality loop the API under test grades through. */
  grader: 3103,
} as const;

export type E2EPorts = { readonly [server in keyof typeof BASE_PORTS]: number };

/**
 * How many port sets there are: the test database's, and one per lane offset
 * below this. The ranges they span (the stub 3103–3199, the API 3200–3296, the
 * UI 4300–4396) overlap neither each other nor a port a developer's stack
 * binds, so no lane lands on a dev server, or on another server of its own.
 */
export const LANE_PORT_SETS = 97;

/** FNV-1a over the lane's name: fixed and dependency-free, so a lane's ports are the same on every machine and every run. */
const hashOf = (text: string): number => {
  let hash = 0x811c9dc5;
  for (const char of text) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return hash;
};

/** 0 for the test database itself; 1…LANE_PORT_SETS − 1 for a lane, from its name alone. Refuses any other database. */
export const lanePortOffset = (database: string): number => {
  const lane = testDatabaseLane(database);
  return lane === null ? 0 : 1 + (hashOf(lane) % (LANE_PORT_SETS - 1));
};

/** The three ports a suite on `database` runs its servers on. */
export const e2ePortsFor = (database: string): E2EPorts => {
  const offset = lanePortOffset(database);
  return {
    api: BASE_PORTS.api + offset,
    ui: BASE_PORTS.ui + offset,
    grader: BASE_PORTS.grader + offset,
  };
};
