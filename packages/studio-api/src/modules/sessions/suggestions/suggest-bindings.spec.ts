import type { BriefBindingProposal, CanvasGraph, NfrItem } from '@sysdesign/contracts';
import { MECHANISM_GUIDE } from '@sysdesign/contracts';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';
import { NoopLlmClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { suggestBindings } from './suggest-bindings';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Buyer' },
    { id: 'n-2', kind: 'gateway', label: 'Gateway', config: { rateLimit: true } },
    { id: 'n-3', kind: 'service', label: 'Checkout' },
    { id: 'n-4', kind: 'database', label: 'Orders', config: { backups: true } },
    { id: 'n-5', kind: 'queue', label: 'Fulfilment', config: { dlq: true } },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    { id: 'e-3', source: 'n-3', target: 'n-4', kind: 'sync' },
  ],
};

const nfrs: NfrItem[] = [
  { id: 'nfr-dur', kind: 'durability', statement: 'Orders survive a node loss' },
  { id: 'nfr-sec', kind: 'security', statement: 'Only signed-in buyers may purchase' },
];

const input = { graph, narrative: null, nfrs, functionalRequirements: ['Reserve a seat'] };

/** Captures the request so the prompt itself can be asserted on. */
function fakeLlm(response: unknown) {
  const seen: StructuredRequest<unknown>[] = [];
  const client: LlmClient = {
    enabled: true,
    model: 'claude-test',
    completeStructured: <T>(request: StructuredRequest<T>) => {
      seen.push(request as StructuredRequest<unknown>);
      return Promise.resolve(response as T | null);
    },
  };
  return { client, seen };
}

const proposals = (...items: BriefBindingProposal[]) => ({ proposals: items });

describe('suggestBindings', () => {
  it('returns nothing without a model, which is the deterministic answer', async () => {
    await expect(suggestBindings(new NoopLlmClient(), input)).resolves.toEqual([]);
  });

  it('never assembles a prompt when the model is off', async () => {
    const { client, seen } = fakeLlm(proposals());
    const off: LlmClient = { ...client, enabled: false };
    await suggestBindings(off, input);
    expect(seen).toHaveLength(0);
  });

  it('returns nothing on refusal, schema miss or API error — all of which are null', async () => {
    const { client } = fakeLlm(null);
    await expect(suggestBindings(client, input)).resolves.toEqual([]);
  });

  it('passes through a proposal the canvas can accept', async () => {
    const { client } = fakeLlm(
      proposals({
        nfrId: 'nfr-dur',
        mechanism: 'backups',
        nodeIds: ['n-4'],
        rationale: 'The orders database has backups configured.',
      }),
    );
    await expect(suggestBindings(client, input)).resolves.toEqual([
      {
        nfrId: 'nfr-dur',
        mechanism: 'backups',
        nodeIds: ['n-4'],
        rationale: 'The orders database has backups configured.',
      },
    ]);
  });

  /**
   * The API refuses an ineligible pairing outright, so offering one would give
   * the author a button that produces a 422 — and the picker would not even
   * list those components.
   */
  it('drops components whose kind cannot carry the mechanism', async () => {
    const { client } = fakeLlm(
      proposals({
        nfrId: 'nfr-dur',
        mechanism: 'backups',
        nodeIds: ['n-4', 'n-2'],
        rationale: 'Both of these, allegedly.',
      }),
    );
    const [kept] = await suggestBindings(client, input);
    expect(kept?.nodeIds).toEqual(['n-4']);
  });

  it('drops a proposal left with no components at all', async () => {
    const { client } = fakeLlm(
      proposals({
        nfrId: 'nfr-sec',
        mechanism: 'backups',
        nodeIds: ['n-2'],
        rationale: 'A gateway cannot hold backups.',
      }),
    );
    await expect(suggestBindings(client, input)).resolves.toEqual([]);
  });

  it('keeps only the first proposal per requirement — the editor holds one binding each', async () => {
    const { client } = fakeLlm(
      proposals(
        { nfrId: 'nfr-dur', mechanism: 'backups', nodeIds: ['n-4'], rationale: 'First.' },
        { nfrId: 'nfr-dur', mechanism: 'dlq', nodeIds: ['n-5'], rationale: 'Second.' },
      ),
    );
    const kept = await suggestBindings(client, input);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.rationale).toBe('First.');
  });

  it('offers an uncorroborated claim rather than hiding it', async () => {
    // The queue has a DLQ; a claim about `at-least-once` is eligible but
    // unproven. Unsupported is graded, not blocked — so it must reach the author.
    const { client } = fakeLlm(
      proposals({
        nfrId: 'nfr-dur',
        mechanism: 'at-least-once',
        nodeIds: ['n-5'],
        rationale: 'The queue redelivers.',
      }),
    );
    await expect(suggestBindings(client, input)).resolves.toHaveLength(1);
  });

  it('locks ids and vocabulary in the schema, so nothing can be invented', async () => {
    const { client, seen } = fakeLlm(proposals());
    await suggestBindings(client, input);

    const schema = seen[0]?.schema as { safeParse: (value: unknown) => { success: boolean } };
    const attempt = (proposal: Record<string, unknown>) =>
      schema.safeParse({ proposals: [proposal] }).success;

    const valid = { nfrId: 'nfr-dur', mechanism: 'backups', nodeIds: ['n-4'], rationale: 'ok' };
    expect(attempt(valid)).toBe(true);
    expect(attempt({ ...valid, nfrId: 'nfr-invented' })).toBe(false);
    expect(attempt({ ...valid, nodeIds: ['n-invented'] })).toBe(false);
    expect(attempt({ ...valid, mechanism: 'telepathy' })).toBe(false);
  });

  /**
   * The design decision this feature turns on. `MECHANISM_GUIDE.proof` states
   * what the engine looks for; handing it over would let a model propose only
   * bindings guaranteed to corroborate, and the explanation dimension would
   * stop measuring the author at all.
   */
  it('tells the model the vocabulary but never how corroboration is computed', async () => {
    const { client, seen } = fakeLlm(proposals());
    await suggestBindings(client, input);
    const sent = `${seen[0]?.system ?? ''}\n${seen[0]?.user ?? ''}`;

    expect(sent).toContain(MECHANISM_GUIDE.backups.label);
    expect(sent).not.toContain(MECHANISM_GUIDE.backups.proof);
    expect(sent).not.toContain(MECHANISM_GUIDE['read-cache'].proof);
  });

  it('shows the model the design and the walkthrough it is reasoning about', async () => {
    const { client, seen } = fakeLlm(proposals());
    await suggestBindings(client, { ...input, narrative: 'The gateway checks the token.' });
    const user = seen[0]?.user ?? '';

    expect(user).toContain('node n-4 kind=database');
    expect(user).toContain('edge e-1: n-1 -> n-2');
    expect(user).toContain('Orders survive a node loss');
    expect(user).toContain('The gateway checks the token.');
  });

  it('does not call the model when there is nothing to reason about', async () => {
    const { client, seen } = fakeLlm(proposals());
    await suggestBindings(client, { ...input, graph: { nodes: [], edges: [] } });
    await suggestBindings(client, { ...input, nfrs: [] });
    expect(seen).toHaveLength(0);
  });
});
