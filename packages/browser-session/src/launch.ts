import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOCUMENT_NAME_PATTERN, errorMessage, type SessionRailsDto } from '@sysdesign/contracts';
import { z } from 'zod';

import { SESSION_FLAGS, SessionConfigError } from './config';
import type { SuppliedDocument } from './core/ports';

/**
 * A launch: the arguments one run of this program takes, declared once as a
 * file under the package's own `launches/` and named by `--launch` — so a
 * scheduled run in the cloud and a launcher on the laptop pass one word, and
 * the goal, the profile, the start URL, the documents and the limits are
 * data read by name rather than flags spelled in every script. A flag given
 * beside the launch wins over its field. The subject is deliberately absent:
 * it is a person's name, which stays in the environment
 * (`BROWSER_SESSION_SUBJECT`) and never in a tracked file; so is the browser
 * mode, which the settings and the flags decide.
 */

/** Where the launch files live, under the package root — beside `config/` and `goals/`. */
const LAUNCHES_DIR = 'launches';

/** A launch name is a file name: lower-case words and digits joined by hyphens, never a path. */
const LAUNCH_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const positive = z.number().int().positive();

/** A bare file name under the documents dir, so a launch file never names a path outside it. */
const bareFileName = z
  .string()
  .min(1)
  .refine((name) => !/[/\\]/.test(name) && name !== '.' && name !== '..', {
    message: 'must be a bare file name under the documents dir, with no path',
  });

const launchSchema = z
  .strictObject({
    /** The mission, a markdown file by its path from the working directory. */
    goal: z.string().regex(/\.md$/, 'must be a markdown file'),
    profile: z.string().min(1),
    /** Where the browser opens before the first plan. */
    url: z.url(),
    /** The file for each document the mission declares, by the mission's name for it. */
    documents: z.record(z.string().regex(DOCUMENT_NAME_PATTERN), bareFileName).optional(),
    targetDone: positive.optional(),
    maxTasks: positive.optional(),
    maxMinutes: positive.optional(),
  })
  .refine(
    (launch) =>
      launch.targetDone === undefined ||
      launch.maxTasks === undefined ||
      launch.targetDone <= launch.maxTasks,
    { message: 'is above maxTasks: every done unit spends that budget too', path: ['targetDone'] },
  );

/** A launch as a run reads it: its documents resolved to files under the documents dir. */
export interface Launch {
  name: string;
  goal: string;
  profile: string;
  url: string;
  documents: SuppliedDocument[];
  targetDone?: number;
  maxTasks?: number;
  maxMinutes?: number;
}

/** The launches a package root declares, by name. */
const knownLaunches = (dir: string): string[] =>
  readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort();

/**
 * The launch file `name` under `<packageRoot>/launches`, read and validated,
 * its documents resolved under `docsDir`. A name no file answers to is
 * refused naming the known launches; a file the schema does not read is
 * refused naming the file and the field.
 */
export function readLaunch(packageRoot: string, name: string, docsDir: string): Launch {
  const dir = join(packageRoot, LAUNCHES_DIR);
  const known = knownLaunches(dir);
  if (!LAUNCH_NAME.test(name) || !known.includes(name)) {
    throw new SessionConfigError(
      `${SESSION_FLAGS.launch.name} ${JSON.stringify(name)} names no launch file under ${dir}; known: ${known.join(', ')}`,
    );
  }
  const path = join(dir, `${name}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new SessionConfigError(`${path} is not JSON: ${errorMessage(error)}`);
  }
  const read = launchSchema.safeParse(parsed);
  if (!read.success) {
    const problems = read.error.issues.map(
      (issue) => `${issue.path.join('.') || 'launch'} ${issue.message}`,
    );
    throw new SessionConfigError(`${path}: ${problems.join('; ')}`);
  }
  const { documents, ...launch } = read.data;
  return {
    name,
    ...launch,
    documents: Object.entries(documents ?? {}).map(([documentName, file]) => ({
      name: documentName,
      path: join(docsDir, file),
    })),
  };
}

/** Every launch the package root declares, by name, its documents resolved under `docsDir`. */
export function readLaunches(packageRoot: string, docsDir: string): Launch[] {
  return knownLaunches(join(packageRoot, LAUNCHES_DIR)).map((name) =>
    readLaunch(packageRoot, name, docsDir),
  );
}

/**
 * The sites whose local storage and IndexedDB an export carries beside the
 * cookies: the origin of each launch that names the profile, and of the URL
 * given, once each — a URL that does not parse refused by flag name.
 */
export function exportOrigins(
  profile: string,
  launches: readonly Launch[],
  url: string | undefined,
): string[] {
  const origins = launches
    .filter((launch) => launch.profile === profile)
    .map((launch) => new URL(launch.url).origin);
  if (url !== undefined) {
    try {
      origins.push(new URL(url).origin);
    } catch {
      throw new SessionConfigError(
        `${SESSION_FLAGS.url.name} must be a URL, got ${JSON.stringify(url)}`,
      );
    }
  }
  return [...new Set(origins)];
}

/** The rails a run starts from: the settings' values, the launch's limits over them; the flags then win over both (`railsOf`). */
export function railsWithLaunch(launch: Launch | null, base: SessionRailsDto): SessionRailsDto {
  if (launch === null) return base;
  return {
    ...base,
    targetDone: launch.targetDone ?? base.targetDone,
    maxTasks: launch.maxTasks ?? base.maxTasks,
    maxMinutes: launch.maxMinutes ?? base.maxMinutes,
  };
}

/** The documents a run supplies: the launch's, each replaced by a flag naming the same document, then the flags' own. */
export function documentsWithLaunch(
  flags: readonly SuppliedDocument[],
  launch: Launch | null,
): SuppliedDocument[] {
  const fromLaunch = (launch?.documents ?? []).filter(
    (document) => !flags.some((flag) => flag.name === document.name),
  );
  return [...fromLaunch, ...flags];
}
