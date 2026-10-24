import {
  type Bid,
  bidOf,
  type BidPipelineSummary,
  bidPipelineSummaryOf,
  type PipelineRow,
  type Target,
  targetOf,
  type TargetSummary,
  targetSummaryOf,
} from '@sysdesign/contracts';

import { LEADS, makeLead, NOTICE_ID } from './fixtures';

/**
 * What the pipeline tracks, over the client's story: three notices as bids,
 * and an award and a firm as targets.
 */

export const BID: Bid = bidOf({ noticeId: NOTICE_ID, reminderAt: '2026-10-01T09:00:00.000Z' });

export const PIPELINE_ROWS: PipelineRow[] = [
  { bid: BID, lead: makeLead() },
  {
    bid: bidOf({
      noticeId: 'a82be74dbc744767aae22bcb273c223f',
      stage: 'submitted',
      notes: '',
      reminderAt: null,
      estimatedValue: null,
    }),
    lead: LEADS[1] ?? makeLead(),
  },
  {
    bid: bidOf({
      noticeId: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
      stage: 'watching',
      reminderAt: '2026-09-28T09:00:00.000Z',
    }),
    lead: LEADS[2] ?? makeLead(),
  },
];

export const PIPELINE_SUMMARY: BidPipelineSummary = bidPipelineSummaryOf({
  byStage: { watching: 1, qualifying: 1, preparing: 0, submitted: 1, won: 0, lost: 0, passed: 0 },
  dueSoon: 2,
  total: 3,
});

/** A tracked award and a tracked firm, the firm with a reminder two days on from 2026-09-27. */
export const TARGET: Target = targetOf();
export const FIRM_TARGET: Target = targetOf({
  id: 't-2',
  kind: 'firm',
  subject: 'JCBMLGPE6Z71',
  label: 'BOOZ ALLEN HAMILTON INC',
  stage: 'contacted',
  nextAction: 'Ask for the program manager.',
  contacts: [{ name: 'Jane Doe', role: 'sblo', channel: 'teaming@example.com', note: '' }],
  links: [{ kind: 'supplier-portal', url: 'https://suppliers.example.com/', label: 'Portal' }],
  activity: [{ at: '2026-09-25T14:00:00.000Z', kind: 'emailed', summary: 'Sent the statement.' }],
  notes: 'Met at the industry day.',
  reminderAt: '2026-09-29T15:00:00.000Z',
  endsAt: null,
});
export const TARGETS: Target[] = [TARGET, FIRM_TARGET];
export const TARGET_SUMMARY: TargetSummary = targetSummaryOf();
