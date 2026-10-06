import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { DEFAULT_GATE_POLICY } from './in-flight-gate';
import { DEFAULT_RETRY_POLICY } from './llm-failure';

/**
 * Which model serves this repository, declared in one file.
 *
 * A provider is a deployment fact, not an environment variable scattered
 * across whatever happens to launch a process: the loop, the browser session
 * and the ingester must all call the same model or their records cannot be
 * compared, and a file both can read is how that is said once. The file is
 * safe to commit, because no secret is in it — `apiKeyVar` names the variable
 * that holds the key, never the key, so a repository carries the choice and a
 * machine carries the credential.
 *
 * Absent, the answer is the Claude Code subscription: what every run before
 * this file existed used, and what a checkout with no file still gets.
 */
export const LLM_CONFIG_FILE = 'llm.config.json';

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

/**
 * The declared config, read once. A file that is absent is the default; a file
 * that is present and wrong is a refusal naming the field, never a quiet
 * fallback onto a provider the operator did not choose — the whole point of
 * writing it down is that what ran is what the file says.
 */
export function readLlmConfig(
  path: string = resolve(process.cwd(), LLM_CONFIG_FILE),
  read: (at: string) => string = (at) => readFileSync(at, 'utf8'),
): LlmConfig {
  let text: string;
  try {
    text = read(path);
  } catch {
    return DEFAULT_LLM_CONFIG;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new LlmConfigError(`${path} is not JSON: ${(cause as Error).message}`);
  }
  const result = llmConfigSchema.safeParse(parsed);
  if (!result.success) {
    const faults = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new LlmConfigError(`${path} is not a model configuration — ${faults}`);
  }
  return result.data;
}

/** The key the config points at, or null where it names none; the value is never logged or returned elsewhere. */
export function apiKeyFor(config: LlmConfig, env: NodeJS.ProcessEnv = process.env): string | null {
  if (config.apiKeyVar === undefined) return null;
  const key = env[config.apiKeyVar];
  return key === undefined || key.trim() === '' ? null : key;
}
