/**
 * The vector math every in-memory fake of a store over Qdrant ranks by, so
 * the fakes agree with each other and with Qdrant's cosine distance on which
 * point is nearer. Spec support only: nothing that runs imports it.
 */
import { createHash } from 'node:crypto';

/** The unit vector a text always maps to — its sha256 bytes, centred and normalised — for a text a spec did not place by hand. */
export function hashedUnitVector(text: string, dimensions: number): number[] {
  const digest = createHash('sha256').update(text, 'utf8').digest();
  const raw = Array.from(
    { length: dimensions },
    (_, index) => (digest[index % digest.length] ?? 0) / 255 - 0.5,
  );
  const norm = Math.hypot(...raw) || 1;
  return raw.map((value) => value / norm);
}

/** Cosine similarity as Qdrant scores it: the dot product over both norms, and 0 when either vector has none. */
export const cosine = (a: readonly number[], b: readonly number[]): number => {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
  const norms = Math.hypot(...a) * Math.hypot(...b);
  return norms === 0 ? 0 : dot / norms;
};
