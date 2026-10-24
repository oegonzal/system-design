import { awardBodyOf, readFencedIndex, introductionIndexSchema } from '@sysdesign/contracts';

import type { TargetRecord } from '../ports';
import {
  composeIntroductionGoal,
  INTRODUCTION_ASK,
  introductionIndexOf,
  introductionReaderOf,
  offerIdAt,
  type IntroductionBrief,
} from './compose';

const T0 = new Date('2026-10-23T12:00:00Z');
const target = (overrides: Partial<TargetRecord> = {}): TargetRecord => ({
  id: 'target-1',
  kind: 'award',
  subject: awardBodyOf().externalId,
  label: awardBodyOf().piid ?? '',
  stage: 'watching',
  notes: '',
  nextAction: '',
  contacts: [],
  links: [],
  activity: [],
  reminderAt: null,
  endsAt: null,
  stageChangedAt: T0,
  createdAt: T0,
  updatedAt: T0,
  ...overrides,
});
const brief = (overrides: Partial<IntroductionBrief> = {}): IntroductionBrief => ({
  company: 'Precision Software LLC',
  introduction: {
    about: 'builds agentic AI workflows and integrations.',
    delivery: 'Remote delivery by a U.S.-citizen principal; unclassified work.',
    contact: 'teaming@precision-software.example',
    offers: [
      {
        id: 'agentic',
        label: 'Agentic workflow engineering',
        line: 'Agents that carry a process end to end.',
      },
      { id: 'qa', label: 'AI-assisted QA', line: 'Automated regression suites.' },
    ],
  },
  target: target(),
  award: awardBodyOf(),
  ...overrides,
});

describe('the introduction goal', () => {
  it('[GOV-40] is composed from the target, the award’s record and the profile’s own words — the program by its contract number, the offers indexed by position, the one ask — and closes with the index the pipeline’s validators read', () => {
    const goal = composeIntroductionGoal(brief());
    expect(goal).toContain(
      '# Introduce Precision Software LLC to BOOZ ALLEN HAMILTON INC about 89303019FET000003',
    );
    expect(goal).toContain('the small business liaison team at BOOZ ALLEN HAMILTON INC');
    expect(goal).toContain('- Contract number: 89303019FET000003');
    expect(goal).toContain(
      '- Buyer: Department of Energy.Department of Energy.HEADQUARTERS PROCUREMENT SERVICES',
    );
    expect(goal).toContain('- Type: BPA CALL under 89303019AET000001');
    expect(goal).toContain('- Runs: 2019-09-27 to 2026-12-26, with options to 2027-12-26');
    expect(goal).toContain('- Subcontracting plan: F INDIVIDUAL SUBCONTRACT PLAN');
    expect(goal).toContain('- Subcontracts reported: 7');
    expect(goal).toContain(
      '[offer.1] Agentic workflow engineering — Agents that carry a process end to end.',
    );
    expect(goal).toContain('[offer.2] AI-assisted QA — Automated regression suites.');
    expect(goal).toContain('Reach the sender at: teaming@precision-software.example');
    expect(goal).toContain(INTRODUCTION_ASK);
    expect(readFencedIndex(goal, introductionIndexSchema)).toEqual({
      pipeline: 'introduction-note',
      piid: '89303019FET000003',
      offerIds: ['offer.1', 'offer.2'],
    });
    expect(introductionIndexOf(brief()).offerIds).toEqual([offerIdAt(0), offerIdAt(1)]);
  });

  it('[GOV-40] addresses the target’s first contact in their declared role, and a firm target by its own label; an award with no plan or no vehicle says so', () => {
    const named = target({
      kind: 'firm',
      label: 'BOOZ ALLEN HAMILTON INC.',
      contacts: [{ name: 'Jane Doe', role: 'sblo', channel: '', note: '' }],
    });
    expect(introductionReaderOf(named, awardBodyOf())).toBe(
      'Jane Doe, small business liaison officer at BOOZ ALLEN HAMILTON INC.',
    );
    const bare = composeIntroductionGoal(
      brief({
        award: awardBodyOf({ subcontractingPlan: null, vehicle: null, endsWithOptionsAt: null }),
      }),
    );
    expect(bare).toContain('- Subcontracting plan: none stated');
    const unnamed = composeIntroductionGoal(
      brief({ introduction: { ...brief().introduction, contact: '' } }),
    );
    expect(unnamed).toContain(
      'Reach the sender at: the address in the attached capability statement',
    );
    expect(bare).toContain('- Type: BPA CALL\n');
    expect(bare).toContain('- Runs: 2019-09-27 to 2026-12-26\n');
  });
});
