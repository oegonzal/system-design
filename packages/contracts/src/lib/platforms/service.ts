import type { NodeKind } from '../canvas';

/**
 * A platform is a catalogue of managed services declared as data: what each
 * is, when to reach for it, the generic roles (`NodeKind`) it may play on the
 * canvas and the knobs an interviewer asks about it. A node that is one of
 * them names it in `service` and keeps one of its roles as `kind`, so
 * everything that reasons about roles — the validators, the lenses, the
 * colours — keeps working, and the service is one more declared fact beside
 * them. Nothing here is read by name anywhere else: a second platform is a
 * second catalogue and one more entry in `PLATFORM_IDS`.
 */
export const PLATFORM_IDS = ['aws'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export const isPlatformId = (value: string): value is PlatformId =>
  (PLATFORM_IDS as readonly string[]).includes(value);

/** One shelf of a platform's catalogue, in the platform's own grouping. */
export interface PlatformCategory<C extends string = string> {
  readonly id: C;
  readonly label: string;
}

export interface PlatformService<C extends string = string> {
  /** `<platform>.<service>`, the id a node's `service` names. */
  readonly id: string;
  /** The product name, shown on the block and in the palette. */
  readonly label: string;
  readonly category: C;
  /** The roles the service may play, the first the one a dropped block starts with. */
  readonly roles: readonly [NodeKind, ...NodeKind[]];
  /** What the service is, present tense, one sentence; bounded like a node guide line. */
  readonly what: string;
  /** The signal that a design wants this service. */
  readonly whenToUse: string;
  /** Config keys an interviewer asks about — suggestions the panel offers, never a vocabulary. */
  readonly knobs: readonly string[];
  /** Words a search for the service should also match: the generic name, a former name, a protocol. */
  readonly aliases: readonly string[];
}

export interface PlatformCatalogue<C extends string = string> {
  readonly id: PlatformId;
  readonly label: string;
  readonly categories: readonly PlatformCategory<C>[];
  readonly services: readonly PlatformService<C>[];
}
