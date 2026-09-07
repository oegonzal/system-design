/**
 * The embeddings seam beside `LlmClient`: one method, `null` on any failure.
 * A caller that cannot embed has no memory to recall or keep — the loop's
 * answer is still produced — so "the provider was unavailable" is never an
 * error path here, exactly as for the chat client.
 */
export interface EmbeddingClient {
  /** False for the no-op client — callers skip recall and storage entirely. */
  readonly enabled: boolean;
  /** Model id in use, or null when disabled. Stored beside every vector. */
  readonly model: string | null;
  /** The length of every vector `embed` returns; a store binds a collection to it. */
  readonly dimensions: number;
  /** One vector per input, in input order — or null on a refusal, a bad shape, or an API error. */
  embed(inputs: readonly string[]): Promise<number[][] | null>;
}

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * The client that runs when no OPENAI_API_KEY is configured — or when the
 * quality loop is pinned deterministic. It never fabricates a vector.
 */
export class NoopEmbeddingClient implements EmbeddingClient {
  readonly enabled = false;
  readonly model = null;
  readonly dimensions = 0;

  embed(): Promise<number[][] | null> {
    return Promise.resolve(null);
  }
}
