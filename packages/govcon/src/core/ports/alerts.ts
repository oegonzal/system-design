import type { AlertKey, GovconAlert, InteractionPrompt } from '@sysdesign/contracts';

/** One alert the warm raised: by its key, for a profile, when, with what was published, the bus's receipt and the digest it was listed in. */
export interface RaisedAlert {
  key: AlertKey;
  /** The scope the alert was first found in — the payload's; null for one found on a tracked target. */
  scopeKey: string | null;
  /** What was published on the alert's topic. */
  payload: unknown;
  /** Its place among the alerts raised with it, the weightiest first. */
  position: number;
  profileId: string;
  raisedAt: Date;
  /** The bus's sequence for the published event. */
  eventSeq: string;
  /** The digest prompt the alert was listed in; null when the digest could not be published. */
  promptId: string | null;
}

/** One alert as the ledger kept it. */
export interface StoredAlert {
  id: string;
  key: AlertKey;
  profileId: string;
  raisedAt: Date;
  /** Null on a row from before payloads were kept. */
  payload: unknown;
}

/** What was already raised, so an alert is raised once per key, and can be read back. */
export interface AlertLedger {
  /** Of these keys, the ones already raised — spelled by `alertKeyOf`. */
  raised(keys: readonly AlertKey[]): Promise<Set<string>>;
  /** Only ever what was published. */
  record(rows: readonly RaisedAlert[]): Promise<void>;
  /** The newest warm's first, and within one warm the weightiest first, with the total. */
  list(page: { limit: number; offset: number }): Promise<[StoredAlert[], number]>;
}

/** Where alerts go: each on its declared topic, and the digest as a prompt put to a person. */
export interface AlertSink {
  publish(alert: GovconAlert): Promise<{ seq: string }>;
  prompt(prompt: InteractionPrompt): Promise<void>;
}
