import { DEFAULT_APPEARANCE_SETTINGS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { createTheme } from '../theme/theme';
import { CHART_SERIES_LIMIT, compactNumber, linear, niceStep, ticks } from './scale';

describe('chart scales', () => {
  it('picks nice steps, brackets the domain with zero among the ticks, and maps linearly either way', () => {
    expect(niceStep(1_234_567, 4)).toBe(500_000);
    expect(ticks({ min: 0, max: 1_234_567 })).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(ticks({ min: -200, max: 900 })).toEqual([-500, 0, 500, 1000]);
    expect(ticks({ min: 300, max: 900 })).toContain(0);
    expect(ticks({ min: 0, max: 0 })).toEqual([0, 1]);
    const y = linear({ min: 0, max: 100 }, [220, 0]);
    expect(y(0)).toBe(220);
    expect(y(50)).toBe(110);
    expect(linear({ min: 5, max: 5 }, [0, 10])(5)).toBe(0);
    expect(compactNumber(1_234_567)).toBe('1.2M');
    expect(compactNumber(-3_400_000)).toBe('-3.4M');
  });

  it('shows exactly as many series as the theme has slots', () => {
    const { color } = createTheme(DEFAULT_APPEARANCE_SETTINGS);
    expect(color.chart.series).toHaveLength(CHART_SERIES_LIMIT);
  });
});
