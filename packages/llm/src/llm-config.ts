import { z } from 'zod';

import { chosenConfig, CONFIG_DIR, ENGINE_FILE, type ReadFile } from './engine-config';
import { DEFAULT_GATE_POLICY } from './in-flight-gate';
import { DEFAULT_RETRY_POLICY } from './llm-failure';

/**
 * Which model serves this repository.
 *
 * A provider is a deployment fact, not an environment variable scattered
 * across whatever happens to launch a process: the loop, the browser session
 * and the ingester must all call the same model or their records cannot be
 * compared, and a file they all read is how that is said once. The
 * configurations live together under `config/llm/`, one per provider and each
 * complete, and `config/engine.json` chooses between them by name.
 *
 * They are safe to commit, because no secret is in them — `apiKeyVar` names
 * the variable that holds the key, never the key, so a repository carries the
 * choice and a machine carries the credential.
 *
 * A checkout that chooses nothing runs on the Claude Code subscription: what
 * every run before any of this existed used.
 */
export const LLM_KIND = 'llm';

export const LLM_PROVIDERS = ['claude-subscription', 'openai-compatible'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const llmConfigSchema = z.strictObject({
  provider: z.enum(LLM_PROVIDERS),
  /** The model id as the provider spells it; absent lets the provider choose. */
  model: z.string().min(1).optional(),
  /** Where an OpenAI-compatible endpoint lives — the API itself, or a local server serving its shape. */
  baseUrl: z.string().url().optional(),
  /** The NAME of the variable holding the key. Never a key. Absent where the endpoint wants none. */
  apiKeyVar: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, 'name a variable, never a key')
    .optional(),
  /** Whether the endpoint is asked to guarantee the schema. Off for a server that does not honour it. */
  strict: z.boolean().default(true),
  maxInFlight: z.number().int().min(1).default(DEFAULT_GATE_POLICY.ceiling),
  attempts: z.number().int().min(1).default(DEFAULT_RETRY_POLICY.attempts),
  timeoutAttempts: z.number().int().min(1).default(DEFAULT_RETRY_POLICY.timeoutAttempts),
});
export type LlmConfig = z.infer<typeof llmConfigSchema>;

/** What a checkout with no file runs on: the subscription, exactly as before the file existed. */
export const DEFAULT_LLM_CONFIG: LlmConfig = llmConfigSchema.parse({
  provider: 'claude-subscription',
});

export class LlmConfigError extends Error {
  override readonly name = 'LlmConfig';
}

/** The configuration in force, and the file it came from — null where nothing was chosen. */
export interface ChosenLlmConfig {
  config: LlmConfig;
  source: string | null;
}

/**
 * The chosen configuration, read once.
 *
 * A file that is present and wrong is a refusal naming the field, never a
 * quiet fallback onto a provider nobody chose — the whole point of writing the
 * choice down is that what ran is what the file says. The source comes back
 * with it so a process can announce which file it is running on: a
 * configuration read once at boot is invisible afterwards, and a file edited
 * under a running process looks exactly like a file that was ignored.
 */
export function readChosenLlmConfig(
  root: string = process.cwd(),
  read?: ReadFile,
): ChosenLlmConfig {
  const chosen = chosenConfig(LLM_KIND, root, read);
  if (chosen.text === null) return { config: DEFAULT_LLM_CONFIG, source: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(chosen.text);
  } catch (cause) {
    throw new LlmConfigError(`${chosen.path} is not JSON: ${(cause as Error).message}`);
  }
  const result = llmConfigSchema.safeParse(parsed);
  if (!result.success) {
    const faults = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new LlmConfigError(`${chosen.path} is not a model configuration — ${faults}`);
  }
  return { config: result.data, source: `${CONFIG_DIR}/${LLM_KIND}/${chosen.name}.json` };
}

/** The chosen configuration alone, for a caller with no use for where it came from. */
export const readLlmConfig = (root?: string, read?: ReadFile): LlmConfig =>
  readChosenLlmConfig(root, read).config;

/** What a boot announces: the model, and the file that chose it. */
export const describeLlmSource = (chosen: ChosenLlmConfig): string =>
  chosen.source ?? `no ${CONFIG_DIR}/${ENGINE_FILE} choice — the default`;

/** The key the config points at, or null where it names none; the value is never logged or returned elsewhere. */
export function apiKeyFor(config: LlmConfig, env: NodeJS.ProcessEnv = process.env): string | null {
  if (config.apiKeyVar === undefined) return null;
  const key = env[config.apiKeyVar];
  return key === undefined || key.trim() === '' ? null : key;
}
