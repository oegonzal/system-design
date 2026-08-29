import { ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import {
  NODE_CONFIG_KEY_MAX_LENGTH,
  NODE_CONFIG_MAX_KEYS,
  NODE_CONFIG_STRING_VALUE_MAX_LENGTH,
} from '@sysdesign/contracts';

/**
 * Enforces `NodeConfig`'s documented flat-scalar invariant at the wire, which
 * a bare `@IsObject` never did: a nested object used to parse fine and end up
 * JSON'd verbatim into the LLM critic's prompt. A config must be a plain
 * object of at most `NODE_CONFIG_MAX_KEYS` entries whose keys stay within
 * `NODE_CONFIG_KEY_MAX_LENGTH` and whose values are bounded strings, finite
 * numbers or booleans — nothing else.
 */
@ValidatorConstraint({ name: 'scalarRecord', async: false })
export class ScalarRecordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    // Plain objects only — JSON.parse always yields these; anything with a
    // richer prototype (Date, Map, a class instance) is not a config bag.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;

    const entries = Object.entries(value);
    if (entries.length > NODE_CONFIG_MAX_KEYS) return false;

    for (const [key, entry] of entries) {
      if (key.length > NODE_CONFIG_KEY_MAX_LENGTH) return false;
      if (typeof entry === 'string') {
        if (entry.length > NODE_CONFIG_STRING_VALUE_MAX_LENGTH) return false;
      } else if (typeof entry === 'number') {
        if (!Number.isFinite(entry)) return false;
      } else if (typeof entry !== 'boolean') {
        return false;
      }
    }
    return true;
  }

  defaultMessage(): string {
    return (
      `config must be a flat object of at most ${NODE_CONFIG_MAX_KEYS} entries — ` +
      `keys ≤ ${NODE_CONFIG_KEY_MAX_LENGTH} chars, values a string ` +
      `≤ ${NODE_CONFIG_STRING_VALUE_MAX_LENGTH} chars, a finite number or a boolean`
    );
  }
}
