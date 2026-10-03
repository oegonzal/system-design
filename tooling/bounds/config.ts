import { join, resolve } from 'node:path';

/**
 * The measurement's configuration, declared once: every flag `pnpm
 * measure:bounds` takes, parsed here into one typed object the rest of the
 * script receives. Nothing else under `tooling/bounds` reads `process`.
 */
export const REPO_ROOT = resolve(__dirname, '..', '..');

/** Where the loop writes its dumps when nothing says otherwise (`QUALITY_LOOP_DUMP_DIR`'s default). */
export const DEFAULT_RUNS_DIR = join(REPO_ROOT, 'static', 'runs');

/** Every flag the measurement takes; a valued flag is `--name=value`, and anything else is refused by name. */
export const MEASURE_FLAGS = {
  /** `=<dir>`: the dumps to read — never written to. */
  runsDir: { name: '--runs-dir' },
  /** `=<date>`: measure only runs started at or after it (ISO date or date-time). */
  since: { name: '--since' },
} as const;

type FlagKey = keyof typeof MEASURE_FLAGS;

export interface MeasureConfig {
  runsDir: string;
  /** Runs started before this are not measured; null measures every recorded run. */
  since: Date | null;
}

export class MeasureConfigError extends Error {
  override readonly name = 'MeasureConfigError';
}

function parseFlags(argv: readonly string[]): Partial<Record<FlagKey, string>> {
  const byName = new Map<string, FlagKey>(
    (Object.entries(MEASURE_FLAGS) as [FlagKey, { name: string }][]).map(([key, flag]) => [
      flag.name,
      key,
    ]),
  );
  const given: Partial<Record<FlagKey, string>> = {};
  for (const arg of argv) {
    const [name, ...rest] = arg.split('=');
    const key = byName.get(name ?? '');
    const value = rest.join('=');
    if (key === undefined || value === '') {
      const expected = Object.values(MEASURE_FLAGS)
        .map((flag) => `${flag.name}=<value>`)
        .join(', ');
      throw new MeasureConfigError(`unknown or malformed flag "${arg}" — expected ${expected}`);
    }
    given[key] = value;
  }
  return given;
}

/** The one read of argv. Anything it cannot use is refused here, by name. */
export function loadMeasureConfig(argv: readonly string[] = process.argv.slice(2)): MeasureConfig {
  const given = parseFlags(argv);
  let since: Date | null = null;
  if (given.since !== undefined) {
    since = new Date(given.since);
    if (Number.isNaN(since.getTime())) {
      throw new MeasureConfigError(`--since must be a date, got ${JSON.stringify(given.since)}`);
    }
  }
  return { runsDir: resolve(given.runsDir ?? DEFAULT_RUNS_DIR), since };
}
