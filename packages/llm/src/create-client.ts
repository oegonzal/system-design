import { CONFIG_DIR } from '@sysdesign/config-kit';
import type { LlmModelDto } from '@sysdesign/contracts';

import {
  describeAccount,
  onBedrock,
  readClaudeAccount,
  signedIn,
  type ClaudeAccount,
} from './claude-account';
import { ClaudeAgentLlmClient, SUBSCRIPTION_MODEL_LABEL } from './claude-agent-client';
import { DisabledEmbeddingClient, type EmbeddingClient } from './embedding-client';
import { providerGate } from './in-flight-gate';
import { DEFAULT_RETRY_POLICY, type LlmRetryPolicy } from './llm-failure';
import type { LlmClient } from './llm-client';
import { apiKeyFor, LLM_KIND, readLlmConfig, type LlmConfig, type LlmProvider } from './llm-config';
import { OpenAiCompatibleLlmClient } from './openai-compatible-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

/**
 * Which model this repository calls, and the factories that build it.
 *
 * The choice is `config/engine.json` naming a file under `config/llm/` — or,
 * for one deployment, the name `LLM_CHOICE` carries — read once: a provider is
 * a deployment fact and belongs where every process can read the same answer,
 * not in whatever environment happens to launch one. A checkout that chooses
 * nothing calls the Claude Code subscription, which is what every run before
 * the file existed used: this machine's `claude login`, or a container's
 * long-lived `CLAUDE_CODE_OAUTH_TOKEN`. The cloud task chooses
 * `claude-bedrock`: the same CLI, told to call Amazon Bedrock with the task
 * role's credentials, billed to the AWS account instead of the subscription.
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

/** The model report a boot announces: the configured model, else the provider's own label. */
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
 * Refuse unless the account the CLI reports is one the provider accepts. The
 * account is asked of the CLI itself, so a Keychain login and an OAuth token
 * are recognised alike; a check that cannot finish is a refusal too, with its
 * own reason, and every refusal carries the provider's own way out.
 */
async function assertAccount(
  read: () => Promise<ClaudeAccount>,
  accepts: (account: ClaudeAccount) => boolean,
  help: string,
): Promise<void> {
  let account: ClaudeAccount;
  try {
    account = await read();
  } catch (cause) {
    throw new MissingModelProviderError({ cause, help });
  }
  if (!accepts(account)) {
    throw new MissingModelProviderError({ found: describeAccount(account), help });
  }
}

/**
 * Refuse unless Claude Code reports the subscription — a CLI pointed at
 * Bedrock included, which is what keeps this laptop on the subscription
 * whatever its shell holds.
 */
export function assertSubscriptionLogin(
  read: () => Promise<ClaudeAccount> = () => readClaudeAccount(),
): Promise<void> {
  return assertAccount(read, signedIn, MODEL_PROVIDER_HELP);
}

/**
 * The way out of a `claude-bedrock` refusal. The CLI is told Bedrock by
 * `providerEnv`, so a `firstParty` here means the configuration never
 * reached it, and a check that could not finish means the CLI itself did
 * not start or answer. Missing AWS credentials are neither: measured
 * 2026-11-16 on this laptop, the CLI reports `bedrock` with no credentials
 * reachable at all, so that case passes the gate and fails the first call —
 * which is why the help names the credentials and the permission both.
 */
export const BEDROCK_PROVIDER_HELP =
  'the chosen configuration calls Claude through Amazon Bedrock: the process needs AWS credentials the default SDK chain can find (the ECS task role in the cloud; AWS_PROFILE or access keys elsewhere), and that identity must be allowed bedrock:InvokeModel and bedrock:InvokeModelWithResponseStream on the configured model and its inference profile; on this machine, unset LLM_CHOICE to run on the subscription';

/** Refuse unless Claude Code reports Amazon Bedrock and no API key: the `claude-bedrock` row's check. */
export function assertBedrockLogin(read: () => Promise<ClaudeAccount>): Promise<void> {
  return assertAccount(read, onBedrock, BEDROCK_PROVIDER_HELP);
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
  // The same CLI as the row above, told to call Amazon Bedrock: the file's
  // region and models become its environment, and the readiness check asks
  // it under that same environment — so a CLI that would still call the
  // subscription, or nothing, is refused before a run rather than minutes in.
  'claude-bedrock': {
    create: (config) =>
      new ClaudeAgentLlmClient({
        model: config.model,
        env: providerEnv(config),
        gate: providerGate({ ceiling: config.maxInFlight }),
        retry: { ...DEFAULT_RETRY_POLICY, ...retryOf(config) },
      }),
    ready: (config, env) =>
      assertBedrockLogin(() => readClaudeAccount({ ...env, ...providerEnv(config) })),
    // The schema requires the model; the fallback is for the type alone.
    label: (config) => config.model ?? 'claude-code/bedrock',
  },
  'openai-compatible': {
    create: (config, env) =>
      new OpenAiCompatibleLlmClient({
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: apiKeyFor(config, env),
        api: config.api,
        store: config.store,
        strict: config.strict,
        omitKeywords: config.omitKeywords,
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
          help: `the chosen ${CONFIG_DIR}/${LLM_KIND} configuration names ${config.apiKeyVar} as the key for ${config.baseUrl ?? 'the endpoint'}: set it in the environment, or choose a configuration whose endpoint wants no key`,
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

/**
 * What a provider tells the CLI it spawns, from the file alone, so the task
 * environment carries no model choice and the file stays the one truth. The
 * names are the vendor's (code.claude.com/docs/en/amazon-bedrock, read
 * 2026-11-16): `CLAUDE_CODE_USE_BEDROCK=1` turns Bedrock on; `AWS_REGION` is
 * where the runtime is called (the CLI would otherwise take the profile's, or
 * `us-east-1`); `ANTHROPIC_MODEL` pins the model as an inference profile id,
 * which also carries the CLI's own background asks unless
 * `ANTHROPIC_DEFAULT_HAIKU_MODEL` names a smaller one. Credentials are the
 * SDK's default chain — an ECS task's `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`
 * passes through `subscriptionEnv` untouched — and nothing here is a secret.
 * The subscription row says nothing: its login is the machine's own.
 */
export function providerEnv(config: LlmConfig): Record<string, string> {
  if (config.provider !== 'claude-bedrock') return {};
  return {
    CLAUDE_CODE_USE_BEDROCK: '1',
    ...given('AWS_REGION', config.region),
    ...given('ANTHROPIC_MODEL', config.model),
    ...given('ANTHROPIC_DEFAULT_HAIKU_MODEL', config.smallModel),
  };
}

/** One variable when the file declares its value; the schema already requires the two Bedrock needs. */
const given = (name: string, value: string | undefined): Record<string, string> =>
  value === undefined ? {} : { [name]: value };

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
