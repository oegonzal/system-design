import { CONFIG_KEY_MAX_LENGTH, type ConfigValue } from '@sysdesign/contracts';

/**
 * How a typed config value crosses the editor's one text input. The wire
 * carries three scalar types and the author types one string, so the string
 * is read by its grammar: a boolean literal, a finite decimal, or text. Two
 * pure functions and their inverses — nothing here knows what any key means.
 */

export type ConfigValueType = 'boolean' | 'number' | 'string';

/** A plain decimal — optional sign, digits, optional fraction. Not `1e3`, not `0x10`, not `Infinity`. */
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export function parseConfigValue(raw: string): ConfigValue {
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  if (DECIMAL.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return trimmed;
}

export function formatConfigValue(value: ConfigValue): string {
  return String(value);
}

export function configValueType(value: ConfigValue): ConfigValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

/** Trimmed and clipped to the contract's key length; the schema requires nothing more. */
export function normalizeConfigKey(raw: string): string {
  return raw.trim().slice(0, CONFIG_KEY_MAX_LENGTH);
}
