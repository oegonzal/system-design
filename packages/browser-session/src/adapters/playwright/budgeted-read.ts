/**
 * Each ref read until the budget is spent, and a count of those left unread.
 *
 * One observation used to be unbounded: a read per element, each inheriting
 * the fifteen-second action timeout, so a page of 128 elements whose renderer
 * had stalled could hold a single observation for over half an hour. Measured
 * live on 2026-10-03 — a session sat eighteen minutes past its own
 * eighteen-minute rail inside one observe, because the engine checks its rails
 * between phases and no phase was ending. A phase the rails cannot interrupt
 * has to bound itself.
 *
 * An unread element is counted, never guessed at and never listed: the adapter
 * cannot say whether it is enabled, visible or a trap, and the session may act
 * only on elements the observation listed.
 */
export async function readWithinBudget<T>(
  refs: readonly string[],
  read: (ref: string) => Promise<T | null>,
  now: () => number,
  budgetMs: number,
): Promise<{ facts: Map<string, T>; unread: number }> {
  const deadline = now() + budgetMs;
  const facts = new Map<string, T>();
  let unread = 0;
  for (const ref of refs) {
    const value = now() < deadline ? await read(ref) : null;
    if (value === null) unread += 1;
    else facts.set(ref, value);
  }
  return { facts, unread };
}
