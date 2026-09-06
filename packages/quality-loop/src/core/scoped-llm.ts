/**
 * Attribution is explicit, not temporal: lenses run concurrently, so every
 * stage instance gets its own recording twin whose closure stamps the scope
 * and a per-scope ordinal. A no-op client is not recordable and passes through.
 */
import { asRecordable, type LlmClient } from '@sysdesign/llm';

import type { ExchangeSink } from './ports';

export function scopeLlm(llm: LlmClient, scope: string, sink: ExchangeSink): LlmClient {
  let ordinal = 0;
  return (
    asRecordable(llm)?.withRecorder((call) => sink({ ...call, scope, ordinal: ++ordinal })) ?? llm
  );
}

/** `Promise.all` with at most `limit` in flight; results keep input order. */
export async function mapConcurrent<A, B>(
  items: readonly A[],
  limit: number,
  fn: (item: A, index: number) => Promise<B>,
): Promise<B[]> {
  const results: B[] = new Array<B>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
