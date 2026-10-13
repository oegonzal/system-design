import type { AlertKey, GovconAlert, InteractionPrompt } from '@sysdesign/contracts';

/** One alert the warm raised: by its key, for a profile, when, with the bus's receipt and the digest it was listed in. */
export interface RaisedAlert {
  key: AlertKey;
  /** The scope the alert was first found in — the payload's. */
  scopeKey: string;
  profileId: string;
  raisedAt: Date;
  /** The bus's sequence for the published event. */
  eventSeq: string;
  /** The digest prompt the alert was listed in; null when the digest could not be published. */
  promptId: string | null;
}

/** What was already raised, so an alert is raised once per key. */
export interface AlertLedger {
  /** Of these keys, the ones already raised — spelled by `alertKeyOf`. */
  raised(keys: readonly AlertKey[]): Promise<Set<string>>;
  /** Only ever what was published. */
  record(rows: readonly RaisedAlert[]): Promise<void>;
}

/** Where alerts go: each on its declared topic, and the digest as a prompt put to a person. */
export interface AlertSink {
  publish(alert: GovconAlert): Promise<{ seq: string }>;
  prompt(prompt: InteractionPrompt): Promise<void>;
}
