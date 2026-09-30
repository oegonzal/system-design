/** The budget's window: strictly at least as strict as any calendar-day quota with the same count. */
export const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface BucketPolicy {
  /** Attempts allowed inside the rolling window, every outcome counted. */
  dailyBudget: number;
}

/**
 * The spending rules, as data. One bucket per upstream source id: every
 * operation against SAM.gov — a search page, a description, an attachment,
 * an award page, an entity lookup — spends the same `sam.gov` bucket, because
 * that is how the provider counts. A source with no bucket is unbudgeted
 * (USAspending) but still ledgered.
 */
export interface BudgetPolicy {
  /** How long a successful search answers the same query again; 0 disables the cache. */
  ttlMs: number;
  /** A pull stops starting slices after this long. */
  pullDeadlineMs: number;
  buckets: Record<string, BucketPolicy>;
}

export const bucketOf = (policy: BudgetPolicy, source: string): BucketPolicy | null =>
  policy.buckets[source] ?? null;
