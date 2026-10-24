import { businessDaysBetween } from './business-days';

describe('business days', () => {
  it('[GOV-39] counts the weekdays after the first day through the last, read as UTC: a Friday to the Monday after is one, a Monday to the next is five, a weekend is none, the same or an earlier day is none, and an unreadable day is none', () => {
    expect(businessDaysBetween('2026-06-05', '2026-06-08')).toBe(1);
    expect(businessDaysBetween('2026-06-08', '2026-06-15')).toBe(5);
    expect(businessDaysBetween('2026-06-06', '2026-06-07')).toBe(0);
    expect(businessDaysBetween('2026-06-07', '2026-06-15')).toBe(6);
    expect(businessDaysBetween('2026-06-15', '2026-06-15')).toBe(0);
    expect(businessDaysBetween('2026-06-16', '2026-06-15')).toBe(0);
    expect(businessDaysBetween('not a day', '2026-06-15')).toBe(0);
  });
});
