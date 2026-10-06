import type { LlmModelDto } from '@sysdesign/contracts';

import { describeAccount, readClaudeAccount, signedIn, type ClaudeAccount } from './claude-account';
import { ClaudeAgentLlmClient, SUBSCRIPTION_MODEL_LABEL } from './claude-agent-client';
import { DisabledEmbeddingClient, type EmbeddingClient } from './embedding-client';
import { providerGate } from './in-flight-gate';
import { DEFAULT_RETRY_POLICY, type LlmRetryPolicy } from './llm-failure';
import type { LlmClient } from './llm-client';
import {
  apiKeyFor,
  LLM_CONFIG_FILE,
  readLlmConfig,
  type LlmConfig,
  type LlmProvider,
} from './llm-config';
import { OpenAiCompatibleLlmClient } from './openai-compatible-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

/**
 * Which model this repository calls, and the factories that build it.
 *
 * The choice is `llm.config.json`, read once — a provider is a deployment
 * fact and belongs where every process can read the same answer, not in
 * whatever environment happens to launch one. A checkout with no file calls
 * the Claude Code subscription, which is what every run before the file
 * existed used: this machine's `claude login`, or a container's long-lived
 * `CLAUDE_CODE_OAUTH_TOKEN`.
 *
 * Secrets stay out of it. The file names the VARIABLE holding a key, never a
 * key, so the choice can be committed and the credential cannot.
 *
 * Whatever the provider, a process that cannot reach its model does not boot:
 * it refuses saying how to fix it, rather than becoming a client that fails
 * every call. The check proves a credential is present, not that it is still
 * valid — that takes a model call, and a revoked one fails the first.
 */
export const MODEL_PROVIDER_HELP =
  'Claude Code is used here only through a subscription login: run `claude login` on this machine, or give a container or CI runner the CLAUDE_CODE_OAUTH_TOKEN that `claude setup-token` prints';

export class MissingModelProviderError extends Error {
  override readonly name = 'MissingModelProvider';

  /**
   * `found` is what the check saw instead of a usable provider; `cause` a
   * check that could not finish; `help` the way out, which is the provider's
   * own to say — telling someone whose OpenAI key is unset to run `claude
   * login` is worse than saying nothing.
   */
  constructor(detail: { found?: string; cause?: unknown; help?: string } = {}) {
    const help = detail.help ?? MODEL_PROVIDER_HELP;
    super(
      detail.cause !== undefined
        ? `could not check the model provider (${detail.cause instanceof Error ? detail.cause.message : String(detail.cause)}) — ${help}`
        : `no model provider${detail.found ? ` (${detail.found})` : ''} — ${help}`,
    );
  }
}

/** The model report a boot announces: the pinned `LLM_MODEL`, else the subscription's label. */
export const describeModelProvider = (config: LlmConfig = readLlmConfig()): LlmModelDto => ({
  model: PROVIDERS[config.provider].label(config),
});

/** Refuse unless the configured provider will answer — each provider's own check, from the table. */
export function assertModelProvider(
  config: LlmConfig = readLlmConfig(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return PROVIDERS[config.provider].ready(config, env);
}

/**
 * Refuse unless Claude Code reports the subscription. The account is asked
 * of the CLI itself, so a Keychain login and an OAuth token are recognised
 * alike; a check that cannot finish is a refusal too, with its own reason.
 */
export async function assertSubscriptionLogin(
  read: () => Promise<ClaudeAccount> = () => readClaudeAccount(),
): Promise<void> {
  let account: ClaudeAccount;
  try {
    account = await read();
  } catch (cause) {
    throw new MissingModelProviderError({ cause });
  }
  if (!signedIn(account)) throw new MissingModelProviderError({ found: describeAccount(account) });
}

/**
 * What each provider needs to be used, as data.
 *
 * A provider is two things and no more: how to build its client, and how to
 * know before booting that it will answer. Declared together so adding a third
 * is a row here rather than an edit to whatever boots — and so the readiness
 * check can never drift from the client it is supposed to be vouching for,
 * which is what a `boot.ts` asking about one provider while the factory built
 * another would mean.
 */
export interface ProviderEntry {
  create(config: LlmConfig, env: NodeJS.ProcessEnv): LlmClient;
  /** Refuse now, saying how to fix it, rather than failing every call minutes into a run. */
  ready(config: LlmConfig, env: NodeJS.ProcessEnv): Promise<void>;
  /** The model a boot announces when the config pins none. */
  label(config: LlmConfig): string;
}

export const PROVIDERS: Readonly<Record<LlmProvider, ProviderEntry>> = {
  'claude-subscription': {
    create: (config) =>
      new ClaudeAgentLlmClient({
        model: config.model,
        gate: providerGate({ ceiling: config.maxInFlight }),
        retry: { ...DEFAULT_RETRY_POLICY, ...retryOf(config) },
      }),
    ready: () => assertSubscriptionLogin(),
    label: (config) => config.model ?? SUBSCRIPTION_MODEL_LABEL,
  },
  'openai-compatible': {
    create: (config, env) =>
      new OpenAiCompatibleLlmClient({
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: apiKeyFor(config, env),
        strict: config.strict,
        gate: providerGate({ ceiling: config.maxInFlight }),
        retry: { ...DEFAULT_RETRY_POLICY, ...retryOf(config) },
      }),
    // Async so a refusal rejects rather than throwing out of a call the caller
    // is awaiting: a `Promise<void>` that sometimes throws synchronously is
    // one a `.catch` does not catch.
    ready: async (config, env) => {
      if (config.apiKeyVar !== undefined && apiKeyFor(config, env) === null) {
        throw new MissingModelProviderError({
          found: `${config.apiKeyVar} is unset or empty`,
          help: `${LLM_CONFIG_FILE} names ${config.apiKeyVar} as the key for ${config.baseUrl ?? 'the endpoint'}: set it in the environment, or point the file at an endpoint that wants no key`,
        });
      }
    },
    label: (config) => config.model ?? 'openai-compatible',
  },
};

const retryOf = (config: LlmConfig): Pick<LlmRetryPolicy, 'attempts' | 'timeoutAttempts'> => ({
  attempts: config.attempts,
  timeoutAttempts: Math.min(config.timeoutAttempts, config.attempts),
});

/** The client the declared configuration asks for. */
export function createQualityLoopLlm(
  config: LlmConfig = readLlmConfig(),
  env: NodeJS.ProcessEnv = process.env,
): LlmClient {
  return PROVIDERS[config.provider].create(config, env);
}

/** Kept for the Nest factory and every caller that has no configuration of its own to pass. */
export function createQualityLoopLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  return createQualityLoopLlm(readLlmConfig(), env);
}

/**
 * The quality loop's embeddings: `OPENAI_API_KEY`, else a disabled client that
 * carries its reason — the memory tier is optional. `OPENAI_EMBEDDING_MODEL`
 * picks the model; `OPENAI_MODEL` names a chat model and stays unread.
 */
export function createEmbeddingClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingClient {
  if (!env['OPENAI_API_KEY']) return new DisabledEmbeddingClient('no-key');
  return new OpenAiEmbeddingClient({
    apiKey: env['OPENAI_API_KEY'],
    model: env['OPENAI_EMBEDDING_MODEL'] || undefined,
  });
}
