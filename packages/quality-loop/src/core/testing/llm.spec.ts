import { bound, bounded } from '@sysdesign/contracts';
import { asDetailed, type LlmCall } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { fakeLlm, sequencedLlm } from './llm';

const schema = z.strictObject({
  summary: bounded.text(bound(200)),
  kind: z.enum(['service', 'queue']),
});
const ask = { system: 's', user: 'u', schema };

describe('the fake model clients', () => {
  it('[QL-42] read a canned answer as the seam does: an overrun kept and reported, a structural fault named', async () => {
    const calls: LlmCall[] = [];
    const over = 'word '.repeat(80).trim();
    const kept = await asDetailed(
      fakeLlm({ summary: over, kind: 'queue' }).withRecorder((call) => calls.push(call)),
    ).completeStructuredDetailed(ask);
    expect(kept).toMatchObject({
      value: { summary: over, kind: 'queue' },
      issues: [],
      overruns: [{ path: 'summary', actual: 399, handling: 'kept-over-ceiling' }],
    });
    expect(calls[0]).toMatchObject({
      outcome: 'ok',
      salvage: { from: 'result', overruns: [{ path: 'summary' }] },
    });

    const refused = await fakeLlm({ summary: 'short', kind: 'bus' }).completeStructuredDetailed(
      ask,
    );
    expect(refused).toMatchObject({ value: null, issues: [{ path: 'kind', soft: false }] });
  });

  it('[QL-42] a sequenced miss names the closest canned answer’s faults', async () => {
    const llm = sequencedLlm({ summary: 'short', kind: 'bus' }, { other: true });
    await expect(llm.completeStructuredDetailed(ask)).resolves.toMatchObject({
      value: null,
      issues: [{ path: 'kind', soft: false }],
    });
    await expect(llm.completeStructured(ask)).resolves.toBeNull();
  });
});
