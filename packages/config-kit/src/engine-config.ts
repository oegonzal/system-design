import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

/**
 * Which configuration each kind of engine component runs on.
 *
 * `config/engine.json` is one entry per kind, and the value names a file
 * rather than holding one: `"llm": "openai"` means `config/llm/openai.json`.
 * So the configurations a program knows how to run sit side by side under
 * `config/<kind>/`, each complete and each readable on its own, and choosing
 * between them is a one-word edit that reads as a choice rather than as a
 * rewrite. Adding a kind is a folder and an entry, not a mechanism.
 *
 * Nothing here knows what any kind is. It resolves a kind to a file under a
 * root — the repository's own `config/` for the model the loop calls, a
 * package's own for that program's settings — and reads it against the schema
 * its owner hands in; what an unnamed kind runs on is the owner's to say.
 *
 * A caller may make the choice for one kind itself — a name it read from its
 * environment, say, where one deployment runs a file the checked-in choices
 * do not — and that name wins over the engine file's for that kind alone. It
 * is held to the same rule: a name, and a file behind it.
 */
export const CONFIG_DIR = 'config';
export const ENGINE_FILE = 'engine.json';

/**
 * What a chosen name may be: a file in that kind's folder, and nothing else.
 * A name is read off a file and turned into a path, so one carrying a
 * separator or a `..` would read a file outside the folder it names.
 */
export const CONFIG_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Kind to the name of its configuration. Open on purpose — unknown kinds are
 * the point, since a kind this build has never heard of is one a later build
 * will, and refusing it here would make the file version-locked to the code.
 */
export const engineConfigSchema = z.record(
  z.string().min(1),
  z.string().regex(CONFIG_NAME, 'must name a file in that kind’s folder, with no path in it'),
);
export type EngineConfig = z.infer<typeof engineConfigSchema>;

export class EngineConfigError extends Error {
  override readonly name = 'EngineConfig';
}

/** How a file is read; injected so a spec never touches a disk. */
export type ReadFile = (at: string) => string;

/** Each field at fault, by its path, as one line a refusal can carry. */
const faultsOf = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');

const readOrNull = (at: string, read: ReadFile): string | null => {
  try {
    return read(at);
  } catch {
    return null;
  }
};

/** The choices as written, or an empty one where nothing is written at all. */
export function readEngineConfig(
  root: string = process.cwd(),
  read: ReadFile = (at) => readFileSync(at, 'utf8'),
): EngineConfig {
  const at = resolve(root, CONFIG_DIR, ENGINE_FILE);
  const text = readOrNull(at, read);
  if (text === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new EngineConfigError(
      `${CONFIG_DIR}/${ENGINE_FILE} is not JSON: ${(cause as Error).message}`,
    );
  }
  const result = engineConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new EngineConfigError(
      `${CONFIG_DIR}/${ENGINE_FILE} is not a set of choices — ${faultsOf(result.error)}`,
    );
  }
  return result.data;
}

export interface ChosenConfig {
  /** The name chosen — the caller's, else the engine file's — or null where neither named one. */
  name: string | null;
  /** Where that name points, or null when nothing was chosen. */
  path: string | null;
  /** The file's contents, or null when nothing was chosen. */
  text: string | null;
}

/** The caller's own name for a kind, held to what a name may be; the engine file's are checked by its schema. */
function callerChoice(kind: string, choice: string): string {
  if (!CONFIG_NAME.test(choice)) {
    throw new EngineConfigError(
      `${kind} is chosen as ${JSON.stringify(choice)}, which must name a file in ${CONFIG_DIR}/${kind}/, with no path in it`,
    );
  }
  return choice;
}

/**
 * The configuration chosen for one kind, or nothing chosen at all. The
 * caller's `choice`, where it makes one, is the name; otherwise the engine
 * file's.
 *
 * A kind nobody named is not an error — a checkout with no `config/` runs on
 * whatever that kind's own default is. A kind named with no file behind it
 * is: choosing by name and silently running something else is the one outcome
 * this is meant to prevent.
 */
export function chosenConfig(
  kind: string,
  root: string = process.cwd(),
  read: ReadFile = (at) => readFileSync(at, 'utf8'),
  choice?: string,
): ChosenConfig {
  const chooser = choice === undefined ? `${CONFIG_DIR}/${ENGINE_FILE}` : 'the caller';
  const name =
    choice === undefined ? readEngineConfig(root, read)[kind] : callerChoice(kind, choice);
  if (name === undefined) return { name: null, path: null, text: null };
  const path = resolve(root, CONFIG_DIR, kind, `${name}.json`);
  const text = readOrNull(path, read);
  if (text === null) {
    throw new EngineConfigError(
      `${chooser} chooses ${kind} "${name}", but ${CONFIG_DIR}/${kind}/${name}.json does not exist`,
    );
  }
  return { name, path, text };
}

/** A chosen configuration read against its owner's schema, and the file it came from, relative to the root. */
export interface Chosen<T> {
  config: T;
  source: string;
}

/**
 * The configuration chosen for one kind — by the caller's `choice`, else by
 * the engine file — read and checked against the schema its owner hands in,
 * or null where none was chosen. A file that is present and wrong is a
 * refusal naming the file and every field at fault, never a quiet fallback:
 * the whole point of writing the choice down is that what ran is what the
 * file says. The source comes back with it so a program can say which file
 * it is running on — a configuration read once at boot is invisible
 * afterwards.
 */
export function readChosen<T>(
  kind: string,
  schema: z.ZodType<T>,
  root: string = process.cwd(),
  read: ReadFile = (at) => readFileSync(at, 'utf8'),
  choice?: string,
): Chosen<T> | null {
  const chosen = chosenConfig(kind, root, read, choice);
  if (chosen.name === null || chosen.text === null) return null;
  const source = `${CONFIG_DIR}/${kind}/${chosen.name}.json`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(chosen.text);
  } catch (cause) {
    throw new EngineConfigError(`${source} is not JSON: ${(cause as Error).message}`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new EngineConfigError(
      `${source} is not a ${kind} configuration — ${faultsOf(result.error)}`,
    );
  }
  return { config: result.data, source };
}
