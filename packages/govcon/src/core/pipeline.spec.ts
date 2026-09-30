import { summarizePipeline } from './pipeline';
import { opportunityOf } from './testing';
import type { BidWithNotice } from './ports';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const row = (
  overrides: Partial<BidWithNotice['bid']> = {},
  deadline: string | null = '2026-10-10T12:00:00.000Z',
): BidWithNotice => ({
  bid: {
    noticeId: 'n-1',
    stage: 'watching',
    notes: '',
    reminderAt: null,
    estimatedValue: null,
    stageChangedAt: new Date(NOW),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  },
  opportunity: opportunityOf({ responseDeadlineAt: deadline }),
});

describe('the pipeline summary', () => {
  it('[GOV-12] counts every stage, zero included, and what is due within the week by reminder or deadline', () => {
    const rows = [
      row({ stage: 'watching' }),
      row({ stage: 'watching', reminderAt: new Date('2026-09-28T09:00:00Z') }),
      row({ stage: 'submitted' }, '2026-09-30T00:00:00.000Z'),
      row({ stage: 'won' }, null),
      row({ stage: 'passed', reminderAt: new Date('2026-09-01T00:00:00Z') }, null),
    ];
    expect(summarizePipeline(rows, NOW)).toEqual({
      byStage: {
        watching: 2,
        qualifying: 0,
        preparing: 0,
        submitted: 1,
        won: 1,
        lost: 0,
        passed: 1,
      },
      dueSoon: 3,
      total: 5,
    });
    expect(summarizePipeline([row()], NOW).dueSoon).toBe(0);
    expect(summarizePipeline([row({}, '2026-10-03T12:00:00.000Z')], NOW).dueSoon).toBe(1);
    expect(summarizePipeline([row({}, null)], NOW).dueSoon).toBe(0);
    expect(summarizePipeline([], NOW).total).toBe(0);
  });
});
