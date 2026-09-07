/**
 * OpenAI embeddings over plain `fetch`: no SDK, because the endpoint is one
 * POST. The transport and the clock are injectable — the same seam as
 * `AnthropicLlmClient({ client })` — so a spec never touches the network.
 */
import {
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  type EmbeddingClient,
} from './embedding-client';

export const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
/** The provider's own ceiling on inputs per request. */
export const MAX_INPUTS_PER_REQUEST = 100;
const MAX_RETRY_AFTER_MS = 10_000;
const DEFAULT_RETRY_AFTER_MS = 1_000;

export type EmbeddingTransport = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export interface OpenAiEmbeddingOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  fetch?: EmbeddingTransport;
  sleep?: Sleep;
}

interface EmbeddingsResponse {
  data?: { index: number; embedding: unknown }[];
}

const retryable = (status: number): boolean => status === 429 || status >= 500;

const retryAfterMs = (response: Response): number => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : DEFAULT_RETRY_AFTER_MS;
};

const warn = (detail: string): void => {
  console.warn(`llm: embeddings request failed — ${detail}`);
};

export class OpenAiEmbeddingClient implements EmbeddingClient {
  readonly enabled = true;
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly transport: EmbeddingTransport;
  private readonly sleep: Sleep;

  constructor(options: OpenAiEmbeddingOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_EMBEDDING_MODEL;
    this.dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS;
    this.transport = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.()));
  }

  async embed(inputs: readonly string[]): Promise<number[][] | null> {
    const vectors: number[][] = [];
    for (let start = 0; start < inputs.length; start += MAX_INPUTS_PER_REQUEST) {
      const batch = await this.embedBatch(inputs.slice(start, start + MAX_INPUTS_PER_REQUEST));
      if (batch === null) return null;
      vectors.push(...batch);
    }
    return vectors;
  }

  /** One request, one retry on a rate limit or a server error, then null. */
  private async embedBatch(batch: readonly string[]): Promise<number[][] | null> {
    try {
      let response = await this.request(batch);
      if (retryable(response.status)) {
        await this.sleep(retryAfterMs(response));
        response = await this.request(batch);
      }
      if (!response.ok) {
        warn(`status ${response.status}`);
        return null;
      }
      return this.vectorsOf((await response.json()) as EmbeddingsResponse, batch.length);
    } catch (error) {
      // Deliberately broad: memory is optional, a background run must never
      // crash because the provider hiccuped.
      warn(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private request(batch: readonly string[]): Promise<Response> {
    return this.transport(OPENAI_EMBEDDINGS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      // `dimensions` is always sent, so any text-embedding-3 model fits the store's width.
      body: JSON.stringify({ model: this.model, input: batch, dimensions: this.dimensions }),
    });
  }

  /** In input order, every vector the width promised — or nothing. */
  private vectorsOf(body: EmbeddingsResponse, expected: number): number[][] | null {
    const data = body.data ?? [];
    if (data.length !== expected) {
      warn(`${data.length} vectors for ${expected} inputs`);
      return null;
    }
    const ordered = [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    const wellFormed = ordered.every(
      (vector): vector is number[] =>
        Array.isArray(vector) &&
        vector.length === this.dimensions &&
        vector.every((value) => typeof value === 'number'),
    );
    if (!wellFormed) {
      warn(`a vector is not ${this.dimensions} numbers wide`);
      return null;
    }
    return ordered as number[][];
  }
}
