import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every config knob is graded, or reserved on purpose.
 *
 * The properties panel is the canonical config vocabulary — the rules read its
 * keys verbatim — and for a long time the only thing enforcing that was a
 * comment asking people to be careful. Drift won: twenty-nine of the fifty-seven
 * knobs turned out to be read by nothing, disproportionately the quantitative
 * ones. An author could set a TTL, a lag budget, a retry count, mTLS, and change
 * no verdict at all. A dial that cannot change an answer is a promise the
 * product does not keep.
 *
 * So this fails the build when a knob is written but neither read by the scoring
 * path nor listed below with a reason. Adding a knob now costs a decision:
 * grade it, drop it, or say out loud why it is here unread.
 */
const REPO = join(__dirname, '..');

const UI_FIELDS = join(
  REPO,
  'packages/studio-ui/src/features/canvas/properties/node-config-fields.tsx',
);

const SCORING_SOURCES = [
  'packages/eval-worker/src/engine/rules',
  'packages/eval-worker/src/engine/passes/expectations',
  'packages/contracts/src/lib/mechanisms.ts',
  // Like mechanisms.ts: shared corroboration predicates the engine scores
  // with — judgeWorkflow reads the `webhooks` knob for push-ingest evidence.
  'packages/contracts/src/lib/workflow-spec.ts',
];

/**
 * Knobs the panel offers that nothing grades — each with the reason it earns
 * its place anyway. Shrinking this list is the point; growing it should feel
 * like something.
 */
const RESERVED: Record<string, string> = {
  // Capacity vocabulary. Graded once the author declares per-instance
  // throughput rather than the engine assuming it.
  maxConnections: 'capacity: pool ceiling, pending author-declared capacity',
  memoryMb: 'capacity: instance size, pending author-declared capacity',
  parallelism: 'capacity: fan-out width, pending author-declared capacity',

  // Resilience knobs whose rules exist but read a sibling key today.
  retries: 'resilience: superseded by maxRetries on the channel, kept for external calls',
  timeoutSeconds: 'resilience: serverless budget; the graded timeout is timeoutMs on inference',

  // Security depth beyond the mechanisms the brief can currently claim.
  mfa: 'security: no mechanism claim models user-facing auth strength yet',
  tokenType: 'security: token format is a choice the rubric holds no opinion on',

  // Genuine design choices the rubric deliberately does not take sides on.
  algorithm: 'load balancing: round-robin vs least-connections is not a gradeable error',
  mode: 'workflow: orchestration vs choreography is a tradeoff, not a mistake',
  sticky: 'load balancing: session affinity is a tradeoff the prompt rarely constrains',
  versioning: 'object store: retention policy is graded; versioning is orthogonal',
  eviction: 'cache: policy matters less than whether staleness is bounded at all',
  downsampling: 'time series: a storage tradeoff no requirement currently states',
  fanout: 'pub/sub: subscriber count is read from the graph, not declared',
  dynamic: 'config service: flag delivery is not a system-design decision at this altitude',
  sampling: 'tracing: a cost/visibility tradeoff with no stated requirement to check against',
};

function readAll(paths: readonly string[]): string {
  let blob = '';
  const walk = (dir: string): void => {
    for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        blob += `${readFileSync(path, 'utf8')}\n`;
      }
    }
  };
  for (const relative of paths) {
    const path = join(REPO, relative);
    if (require('node:fs').statSync(path).isDirectory()) walk(path);
    else blob += `${readFileSync(path, 'utf8')}\n`;
  }
  return blob;
}

/** Keys the properties panel writes onto `node.config`. */
function writtenKnobs(): string[] {
  const source = readFileSync(UI_FIELDS, 'utf8');
  return [...new Set([...source.matchAll(/setKey,\s*\n?\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))];
}

/**
 * Keys the scoring path reads. Both access shapes matter: a bracket lookup and
 * a dot lookup are the same read, and missing the second is how an earlier
 * count of this landed eight knobs off.
 */
function readKnobs(): Set<string> {
  const blob = readAll(SCORING_SOURCES);
  const found = new Set<string>();
  for (const pattern of [
    /config\??\.?\[\s*'([A-Za-z0-9_]+)'\s*\]/g,
    /config\??\.([A-Za-z0-9_]+)/g,
    /configNumber\(\s*[A-Za-z.]+,\s*'([A-Za-z0-9_]+)'/g,
    /\bc\['([A-Za-z0-9_]+)'\]/g,
  ]) {
    for (const match of blob.matchAll(pattern)) found.add(match[1]);
  }
  return found;
}

describe('config knobs', () => {
  const written = writtenKnobs();
  const read = readKnobs();

  it('finds the vocabulary it is meant to guard', () => {
    expect(written.length).toBeGreaterThan(30);
    expect(read.size).toBeGreaterThan(10);
  });

  it('every knob the panel offers is graded, or reserved with a reason', () => {
    const orphaned = written.filter((knob) => !read.has(knob) && RESERVED[knob] === undefined);
    expect(orphaned).toEqual([]);
  });

  /** A reservation for a knob that no longer exists is stale bookkeeping. */
  it('reserves nothing the panel does not offer', () => {
    const stale = Object.keys(RESERVED).filter((knob) => !written.includes(knob));
    expect(stale).toEqual([]);
  });

  /** …and nothing reserved should already be graded. */
  it('reserves nothing that is in fact graded', () => {
    const contradictory = Object.keys(RESERVED).filter((knob) => read.has(knob));
    expect(contradictory).toEqual([]);
  });

  it('every reservation says why', () => {
    for (const [knob, reason] of Object.entries(RESERVED)) {
      expect(reason.length, `${knob} needs a reason`).toBeGreaterThan(20);
    }
  });
});
