import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Which configuration each kind of engine component runs on.
 *
 * `config/engine.env` is one line per kind, and the value names a file rather
 * than holding one: `llm=openai` means `config/llm/openai.json`. So the
 * configurations a repository knows how to run sit side by side under
 * `config/<kind>/`, each complete and each readable on its own, and choosing
 * between them is a one-word edit that reads as a choice rather than as a
 * rewrite. Adding a second kind is a folder and a line, not a mechanism.
 *
 * Nothing here knows what an LLM is. It resolves a kind to a file; whoever
 * owns that kind validates what is in it. It lives in this package because
 * this is the only kind so far — when a second one arrives it belongs
 * wherever both can reach.
 */
export const CONFIG_DIR = 'config';
export const ENGINE_ENV_FILE = 'engine.env';

export class EngineConfigError extends Error {
  override readonly name = 'EngineConfig';
}

/** A `KEY=value` file: blank lines and `#` comments ignored, values trimmed, last wins. */
export function parseEngineEnv(text: string): Record<string, string> {
  const chosen: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 0) continue;
    const key = trimmed.slice(0, at).trim();
    const value = trimmed.slice(at + 1).trim();
    if (key !== '') chosen[key] = value;
  }
  return chosen;
}

/** How a file is read; injected so a spec never touches a disk. */
export type ReadFile = (at: string) => string;

const readOrNull = (at: string, read: ReadFile): string | null => {
  try {
    return read(at);
  } catch {
    return null;
  }
};

export interface ChosenConfig {
  /** The name `engine.env` gave, or null where it named none. */
  name: string | null;
  /** Where that name points, or null when nothing was chosen. */
  path: string | null;
  /** The file's contents, or null when nothing was chosen. */
  text: string | null;
}

/**
 * The configuration chosen for one kind, or nothing chosen at all.
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
): ChosenConfig {
  const envText = readOrNull(resolve(root, CONFIG_DIR, ENGINE_ENV_FILE), read);
  const name = envText === null ? undefined : parseEngineEnv(envText)[kind];
  if (name === undefined || name === '') return { name: null, path: null, text: null };
  const path = resolve(root, CONFIG_DIR, kind, `${name}.json`);
  const text = readOrNull(path, read);
  if (text === null) {
    throw new EngineConfigError(
      `${CONFIG_DIR}/${ENGINE_ENV_FILE} chooses ${kind}=${name}, but ${CONFIG_DIR}/${kind}/${name}.json does not exist`,
    );
  }
  return { name, path, text };
}
