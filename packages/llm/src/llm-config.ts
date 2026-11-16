import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';
import { z } from 'zod';

import { DEFAULT_GATE_POLICY } from './in-flight-gate';
import { DEFAULT_RETRY_POLICY } from './llm-failure';
import { OMITTABLE_KEYWORDS } from './strict-schema';

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
 *
 * One deployment may run a file the checked-in choice does not name: the
 * cloud task calls Claude through Amazon Bedrock while this laptop stays on
 * the subscription, and both read the same repository. So a process may be
 * told the NAME of a `config/llm/` file through `LLM_CHOICE` — the one
 * environment variable this package reads, declared in `LLM_ENV` — and that
 * name wins over `config/engine.json` for the model alone. It is still a
 * choice between committed files, never a configuration of its own: the
 * environment says which file, and the file says everything else.
 */
export const LLM_KIND = 'llm';

export const LLM_PROVIDERS = [
  'claude-subscription',
  'claude-bedrock',
  'openai-compatible',
] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/**
 * The environment this package reads, declared as the other packages declare
 * theirs: one row, the deployment's choice of file. Unset or blank is no
 * choice and `config/engine.json` decides; a name with no file behind it is
 * config-kit's refusal, never a quiet run on something else.
 */
export const LLM_ENV = {
  choice: { name: 'LLM_CHOICE', fallback: undefined },
} as const;

/**
 * Which of OpenAI's two shapes an endpoint is asked through.
 *
 * Both are "OpenAI-compatible" and they are not interchangeable: the ask is
 * written differently, the reply is read differently, and no endpoint is
 * guaranteed to serve both — so this is a fact about the endpoint, declared
 * beside its URL rather than decided in code. `chat` is the default because it
 * is the shape every OpenAI-shaped server implements; `responses` is OpenAI's
 * newer one, and what a run must use for the exchange to appear in that
 * provider's own logs under a response id.
 */
export const LLM_APIS = ['chat', 'responses'] as const;
export type LlmApi = (typeof LLM_APIS)[number];

/** The fields a `config/llm/` file may carry; `llmConfigSchema` adds what each provider requires of them. */
const llmFileShape = z.strictObject({
  provider: z.enum(LLM_PROVIDERS),
  /**
   * The model id as the provider spells it; absent lets the provider choose.
   * `claude-bedrock` requires it, as an inference profile id.
   */
  model: z.string().min(1).optional(),
  /**
   * The model the CLI runs its own small asks on, for `claude-bedrock` alone
   * and in inference-profile form; absent leaves the CLI's default for it.
   */
  smallModel: z.string().min(1).optional(),
  /**
   * The AWS region Bedrock is called in; `claude-bedrock` requires it and no
   * other provider reads it.
   */
  region: z.string().min(1).optional(),
  /** Where an OpenAI-compatible endpoint lives — the API itself, or a local server serving its shape. */
  baseUrl: z.string().url().optional(),
  /** Which OpenAI shape that endpoint is asked through. */
  api: z.enum(LLM_APIS).default('chat'),
  /**
   * Ask the endpoint to retain the exchange, so it shows in the provider's own
   * logs beside the id the run records. Absent leaves the endpoint's default,
   * which is what a local server with no such notion wants.
   */
  store: z.boolean().optional(),
  /** The NAME of the variable holding the key. Never a key. Absent where the endpoint wants none. */
  apiKeyVar: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, 'name a variable, never a key')
    .optional(),
  /** Whether the endpoint is asked to guarantee the schema. Off for a server that does not honour it. */
  strict: z.boolean().default(true),
  /**
   * JSON Schema keywords left out of the schema the endpoint is sent, for an
   * endpoint that compiles the schema into a grammar and refuses some of them.
   * A keyword left out is still enforced on the reply by the zod parse — a
   * size leniently, as every size is. Measured 2026-10-08: Ollama 0.33.1
   * answered 400 "failed to parse grammar" to the browser-step producer schema
   * and to the same schema without `pattern` or `maxItems`; without
   * `minLength`/`maxLength` it answered in 26 s. OpenAI takes every keyword.
   */
  omitKeywords: z.array(z.enum(OMITTABLE_KEYWORDS)).default([]),
  maxInFlight: z.number().int().min(1).default(DEFAULT_GATE_POLICY.ceiling),
  attempts: z.number().int().min(1).default(DEFAULT_RETRY_POLICY.attempts),
  timeoutAttempts: z.number().int().min(1).default(DEFAULT_RETRY_POLICY.timeoutAttempts),
});

/** What a `claude-bedrock` file must say, each refused by name when it does not. */
const BEDROCK_PINS = ['model', 'region'] as const;

/**
 * A file read against what its provider requires. Bedrock has no "the
 * provider's choice": an unpinned CLI runs the vendor's default there — an
 * Opus, billed at the Opus rate — and the region is where the bill lands, so
 * a Bedrock file names both or is refused by field. The subscription row
 * keeps `model` optional, as every checkout without a file relies on.
 */
export const llmConfigSchema = llmFileShape.superRefine((config, ctx) => {
  if (config.provider !== 'claude-bedrock') return;
  for (const field of BEDROCK_PINS) {
    if (config[field] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `a claude-bedrock configuration must declare its ${field}`,
      });
    }
  }
});
export type LlmConfig = z.infer<typeof llmConfigSchema>;

/** What a checkout with no file runs on: the subscription, exactly as before the file existed. */
export const DEFAULT_LLM_CONFIG: LlmConfig = llmConfigSchema.parse({
  provider: 'claude-subscription',
});

/** What named the file in force: the deployment's `LLM_CHOICE`, else `config/engine.json`. */
type LlmChooser = typeof LLM_ENV.choice.name | typeof ENGINE_FILE;

/** The configuration in force, the file it came from and what chose it — null where nothing was chosen. */
export interface ChosenLlmConfig {
  config: LlmConfig;
  source: string | null;
  chosenBy: LlmChooser | null;
}

/** The deployment's own choice of file, trimmed; unset or blank is none, and the engine file decides. */
const envChoice = (env: NodeJS.ProcessEnv): string | undefined => {
  const named = env[LLM_ENV.choice.name]?.trim();
  return named === undefined || named === '' ? undefined : named;
};

/**
 * The chosen configuration, read once: the file `LLM_CHOICE` names in `env`,
 * else the one `config/engine.json` names.
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
  env: NodeJS.ProcessEnv = process.env,
): ChosenLlmConfig {
  const choice = envChoice(env);
  const chosen = readChosen(LLM_KIND, llmConfigSchema, root, read, choice);
  if (chosen === null) return { config: DEFAULT_LLM_CONFIG, source: null, chosenBy: null };
  return { ...chosen, chosenBy: choice === undefined ? ENGINE_FILE : LLM_ENV.choice.name };
}

/** The chosen configuration alone, for a caller with no use for where it came from. */
export const readLlmConfig = (root?: string, read?: ReadFile, env?: NodeJS.ProcessEnv): LlmConfig =>
  readChosenLlmConfig(root, read, env).config;

/**
 * What a boot announces: the file that chose the model, and `LLM_CHOICE` when
 * the deployment named it over the engine file — the one case where the
 * checked-in choice and the running one differ, so the line must say so.
 */
export const describeLlmSource = (chosen: ChosenLlmConfig): string => {
  if (chosen.source === null) return `no ${CONFIG_DIR}/${ENGINE_FILE} choice — the default`;
  return chosen.chosenBy === LLM_ENV.choice.name
    ? `${chosen.source} (${LLM_ENV.choice.name})`
    : chosen.source;
};

/** The key the config points at, or null where it names none; the value is never logged or returned elsewhere. */
export function apiKeyFor(config: LlmConfig, env: NodeJS.ProcessEnv = process.env): string | null {
  if (config.apiKeyVar === undefined) return null;
  const key = env[config.apiKeyVar];
  return key === undefined || key.trim() === '' ? null : key;
}
