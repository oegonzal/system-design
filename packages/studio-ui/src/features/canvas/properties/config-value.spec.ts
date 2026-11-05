import { CONFIG_KEY_MAX_LENGTH } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import {
  configValueType,
  formatConfigValue,
  normalizeConfigKey,
  parseConfigValue,
} from './config-value';

describe('parseConfigValue', () => {
  it('[UX-9] reads a boolean literal, in any case, as a flag', () => {
    expect(parseConfigValue('true')).toBe(true);
    expect(parseConfigValue(' FALSE ')).toBe(false);
  });

  it('[UX-9] reads a finite decimal as a number', () => {
    expect(parseConfigValue('3')).toBe(3);
    expect(parseConfigValue(' -0.5 ')).toBe(-0.5);
    expect(parseConfigValue('99.95')).toBe(99.95);
  });

  it('[UX-9] keeps anything else as trimmed text — including numeric-looking strings that are not decimals', () => {
    expect(parseConfigValue('  cache-aside ')).toBe('cache-aside');
    expect(parseConfigValue('1e3')).toBe('1e3');
    expect(parseConfigValue('0x10')).toBe('0x10');
    expect(parseConfigValue('Infinity')).toBe('Infinity');
    expect(parseConfigValue('0 2 * * *')).toBe('0 2 * * *');
    expect(parseConfigValue('')).toBe('');
  });
});

describe('formatConfigValue / configValueType', () => {
  it('formats every scalar back to the text that parses to it', () => {
    for (const value of [true, false, 3, -0.5, 'cache-aside']) {
      expect(parseConfigValue(formatConfigValue(value))).toBe(value);
    }
  });

  it('names the type by the value, never the key', () => {
    expect(configValueType(true)).toBe('boolean');
    expect(configValueType(3)).toBe('number');
    expect(configValueType('3 nodes')).toBe('string');
  });
});

describe('normalizeConfigKey', () => {
  it('trims and clips to the contract length', () => {
    expect(normalizeConfigKey('  replicas ')).toBe('replicas');
    expect(normalizeConfigKey('k'.repeat(CONFIG_KEY_MAX_LENGTH + 5))).toHaveLength(
      CONFIG_KEY_MAX_LENGTH,
    );
    expect(normalizeConfigKey('   ')).toBe('');
  });
});
