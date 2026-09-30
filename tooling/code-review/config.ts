import { SUBSCRIPTION_TOKEN_SOURCES } from '@sysdesign/llm';

import type { Scope } from './context';
import { PROFILES, type ProfileName, type ProfileSettings } from './critics';
import { DEFAULT_RUNS_DIR, type CiProvenance } from './persist';

/**
 * The review's configuration, declared once.
 *
 * Every knob the review reads — its argv flags, its own environment variables
 * and the ones the CI platform sets — is named and parsed here, once, into one
 * typed object the rest of the pipeline receives. Nothing else under
 * `tooling/code-review` reads the environment, and the pre-commit hook and the
 * CI review job use no variable this file does not declare; `config.spec.ts`
 * holds all three to that. Per-profile settings (critics, model, budgets,
 * limits, timeout) live in `PROFILES`; this file only picks one and applies
 * the declared overrides.
 *
 * Model access is deliberately absent. The review reaches Claude Code the way
 * the quality loop does, through `@sysdesign/llm`, on the subscription login
 * only: a machine's `claude login`, or in CI the `CLAUDE_CODE_OAUTH_TOKEN`
 * that `claude setup-token` prints, stored as a repository secret. There is
 * no key and no switch.
 */
/**
 * Every flag the review takes. A switch stands alone; a valued flag is
 * `--name=value`. Anything else — an unknown flag, `--profile full` with a
 * space, an empty value — is refused by name rather than silently ignored.
 */
export const REVIEW_FLAGS = {
  /** Review the staged index (the pre-commit hook). Implies the quick profile. */
  staged: { name: '--staged', valued: false },
  /** `=<ref>`: review the branch against a base (CI). Implies the full profile. */
  base: { name: '--base', valued: true },
  /** `=<name>`: override the profile the scope implies. */
  profile: { name: '--profile', valued: true },
  /** `=<path>`: also write the report as markdown. */
  markdown: { name: '--markdown', valued: true },
  /** `=<path>`: where run records go; outranks the variable. */
  runsDir: { name: '--runs-dir', valued: true },
  /** Leave no run record behind. */
  noRecord: { name: '--no-record', valued: false },
} as const;

type FlagKey = keyof typeof REVIEW_FLAGS;

export const REVIEW_ENV = {
  /** Where run records are written. */
  runsDir: 'CODE_REVIEW_RUNS_DIR',
  /** Replaces the profile's diff budget, so it can be re-measured rather than argued about. */
  maxDiffChars: 'CODE_REVIEW_MAX_DIFF_CHARS',
  /** How a finding whose evidence the prompt does not contain is treated. */
  evidenceGuard: 'CODE_REVIEW_EVIDENCE_GUARD',
  /** The change's stated purpose; a staged commit has no message to read one from. */
  intent: 'REVIEW_INTENT',
  /** Set on every Claude Code process the review spawns; the pre-commit hook stands down when it sees it. */
  running: 'CODE_REVIEW_RUNNING',
  /** Read by the pre-commit hook alone: skip the review step. */
  skip: 'SKIP_REVIEW',
} as const;

/** What the CI platform sets. Read for provenance and output, never configured. */
export const PLATFORM_ENV = {
  ci: 'CI',
  githubActions: 'GITHUB_ACTIONS',
  runId: 'GITHUB_RUN_ID',
  ref: 'GITHUB_REF',
  stepSummary: 'GITHUB_STEP_SUMMARY',
} as const;

/**
 * Every variable the review, its hook or its CI job may name: its own, the
 * platform's, and the subscription token Claude Code itself reads (declared in
 * `@sysdesign/llm`, the one place that decides what the subscription is).
 */
export const DECLARED_ENV: ReadonlySet<string> = new Set([
  ...Object.values(REVIEW_ENV),
  ...Object.values(PLATFORM_ENV),
  ...SUBSCRIPTION_TOKEN_SOURCES,
]);

export const EVIDENCE_GUARDS = ['enforce', 'warn', 'off'] as const;
export type EvidenceGuard = (typeof EVIDENCE_GUARDS)[number];
const DEFAULT_EVIDENCE_GUARD: EvidenceGuard = 'warn';

export interface ReviewConfig {
  scope: Scope;
  profile: ProfileName;
  /** The profile's settings with the declared overrides applied. */
  settings: ProfileSettings;
  markdownOut: string | undefined;
  runsDir: string;
  /** False under `--no-record`: the run leaves no file behind. */
  record: boolean;
  intent: string | undefined;
  evidenceGuard: EvidenceGuard;
  stepSummaryPath: string | undefined;
  ci: CiProvenance;
  /**
   * The environment every Claude Code process the review spawns starts from —
   * this one, marked as running inside a review. `@sysdesign/llm` withholds
   * every non-subscription credential from it on the way in.
   */
  claudeEnv: NodeJS.ProcessEnv;
}

export class ReviewConfigError extends Error {
  override readonly name = 'ReviewConfigError';
}

/** The flags given, checked against the declaration: switches as `true`, valued flags as their value. */
function parseFlags(argv: readonly string[]): Partial<Record<FlagKey, string | true>> {
  const byName = new Map(
    (Object.entries(REVIEW_FLAGS) as [FlagKey, (typeof REVIEW_FLAGS)[FlagKey]][]).map(
      ([key, flag]) => [flag.name, { key, valued: flag.valued }],
    ),
  );
  const given: Partial<Record<FlagKey, string | true>> = {};
  for (const arg of argv) {
    const [name, ...rest] = arg.split('=');
    const flag = byName.get(name ?? '');
    const value = rest.join('=');
    if (!flag || flag.valued !== rest.length > 0 || (flag.valued && value === '')) {
      const expected = Object.values(REVIEW_FLAGS)
        .map((f) => (f.valued ? `${f.name}=<value>` : f.name))
        .join(', ');
      throw new ReviewConfigError(`unknown or malformed flag "${arg}" — expected ${expected}`);
    }
    given[flag.key] = flag.valued ? value : true;
  }
  return given;
}

const valueOf = (
  given: Partial<Record<FlagKey, string | true>>,
  key: FlagKey,
): string | undefined => {
  const value = given[key];
  return typeof value === 'string' ? value : undefined;
};

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
};

function positiveInteger(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = set(env, name);
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0) {
    throw new ReviewConfigError(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

function oneOf<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = set(env, name);
  if (raw === undefined) return fallback;
  if (!allowed.includes(raw as T)) {
    throw new ReviewConfigError(
      `${name} must be one of ${allowed.join(', ')}, got ${JSON.stringify(raw)}`,
    );
  }
  return raw as T;
}

function ciProvenance(env: NodeJS.ProcessEnv): CiProvenance {
  if (env[PLATFORM_ENV.githubActions] === 'true') {
    return {
      isCi: true,
      provider: 'github-actions',
      runId: env[PLATFORM_ENV.runId],
      ref: env[PLATFORM_ENV.ref],
    };
  }
  return { isCi: Boolean(set(env, PLATFORM_ENV.ci)) };
}

/**
 * The one read of argv and the environment — the only place under
 * `tooling/code-review` that touches `process`. Anything it cannot use is
 * refused here, by name.
 */
export function loadReviewConfig(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): ReviewConfig {
  const given = parseFlags(argv);
  const staged = given.staged === true;
  const base = valueOf(given, 'base');
  if (staged === (base !== undefined)) {
    throw new ReviewConfigError('specify exactly one of --staged or --base=<ref>');
  }

  const requested = valueOf(given, 'profile') ?? (staged ? 'quick' : 'full');
  if (!Object.hasOwn(PROFILES, requested)) {
    throw new ReviewConfigError(
      `unknown profile "${requested}" — expected ${Object.keys(PROFILES).join(' or ')}`,
    );
  }
  const profile = requested as ProfileName;
  const chosen: ProfileSettings = PROFILES[profile];

  return {
    scope: staged ? { kind: 'staged' } : { kind: 'base', ref: base as string },
    profile,
    settings: {
      ...chosen,
      diffBudgetChars: positiveInteger(env, REVIEW_ENV.maxDiffChars) ?? chosen.diffBudgetChars,
    },
    markdownOut: valueOf(given, 'markdown'),
    runsDir: valueOf(given, 'runsDir') ?? set(env, REVIEW_ENV.runsDir) ?? DEFAULT_RUNS_DIR,
    record: given.noRecord !== true,
    intent: env[REVIEW_ENV.intent],
    evidenceGuard: oneOf(env, REVIEW_ENV.evidenceGuard, EVIDENCE_GUARDS, DEFAULT_EVIDENCE_GUARD),
    stepSummaryPath: set(env, PLATFORM_ENV.stepSummary),
    ci: ciProvenance(env),
    claudeEnv: { ...env, [REVIEW_ENV.running]: '1' },
  };
}
