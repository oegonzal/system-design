/**
 * Documentation aliases. TypeScript cannot enforce the format of either, but a
 * signature that says `Uuid` or `IsoDateString` tells the reader (and the
 * mapper author) exactly what crosses the wire, where `string` says nothing.
 */
export type Uuid = string;

/** An RFC 3339 timestamp, e.g. `2026-08-27T18:04:05.000Z`. Mappers own the Date → string edge. */
export type IsoDateString = string;
