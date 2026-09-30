import type { LlmAvailabilityDto } from '@sysdesign/contracts';

/**
 * The embeddings seam beside `LlmClient`: one method, `null` on any failure.
 * Unlike the model, embeddings are optional — the memory tier is advisory,
 * and a run whose memory steps skip still produces its answer — so a
 * process without OPENAI_API_KEY boots with a disabled client that says why.
 */
export interface EmbeddingClient {
  /** False for the disabled client — callers skip recall and storage entirely. */
  readonly enabled: boolean;
  /** Model id in use, or null when disabled. Stored beside every vector. */
  readonly model: string | null;
  /** The length of every vector `embed` returns; a store binds a collection to it. */
  readonly dimensions: number;
  /** Why the client is disabled; null when it is not. Read from the client, never re-derived from env. */
  readonly reason: LlmAvailabilityDto['reason'];
  /** One vector per input, in input order — or null on a refusal, a bad shape, or an API error. */
  embed(inputs: readonly string[]): Promise<number[][] | null>;
}

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

/** The client that runs when no OPENAI_API_KEY is configured. It never fabricates a vector. */
export class DisabledEmbeddingClient implements EmbeddingClient {
  readonly enabled = false;
  readonly model = null;
  readonly dimensions = 0;

  constructor(readonly reason: NonNullable<LlmAvailabilityDto['reason']>) {}

  embed(): Promise<number[][] | null> {
    return Promise.resolve(null);
  }
}

/** The availability a client reports — derived facts only, never the key. */
export const embeddingAvailability = (client: EmbeddingClient): LlmAvailabilityDto => ({
  enabled: client.enabled,
  model: client.model,
  reason: client.reason,
});
