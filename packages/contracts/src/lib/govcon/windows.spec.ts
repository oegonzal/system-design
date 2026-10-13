import { windowOf } from './windows';

const JUNE_15 = Date.UTC(2026, 5, 15, 12);

describe('the breakdown windows', () => {
  it('[GOVU-11] names a preset as two ISO dates through the fiscal calendar at the instant given: the year to date, the prior fiscal year, the one before it, the last twelve months', () => {
    expect(windowOf('fytd', JUNE_15)).toEqual({ from: '2025-10-01', to: '2026-06-15' });
    expect(windowOf('prior-fy', JUNE_15)).toEqual({ from: '2024-10-01', to: '2025-09-30' });
    expect(windowOf('fy-before-last', JUNE_15)).toEqual({ from: '2023-10-01', to: '2024-09-30' });
    // Thirteen days into a fiscal year the prior one has only just ended; the one before it is whole.
    expect(windowOf('prior-fy', Date.UTC(2026, 9, 13))).toEqual({
      from: '2025-10-01',
      to: '2026-09-30',
    });
    expect(windowOf('fy-before-last', Date.UTC(2026, 9, 13))).toEqual({
      from: '2024-10-01',
      to: '2025-09-30',
    });
    expect(windowOf('last-12-months', JUNE_15)).toEqual({ from: '2025-06-15', to: '2026-06-15' });
    expect(windowOf('fytd', Date.UTC(2026, 9, 12))).toEqual({
      from: '2026-10-01',
      to: '2026-10-12',
    });
  });
});
