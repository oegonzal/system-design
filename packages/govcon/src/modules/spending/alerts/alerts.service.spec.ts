import { awardEndingSchema, type AlertKey } from '@sysdesign/contracts';

import type { RaisedAlert } from '../../../core/ports';
import { InMemoryAlertLedger } from '../../../core/spending/testing';
import { AlertsService } from './alerts.service';

const ENDING = awardEndingSchema.parse({
  profileId: 'enfav',
  scopeKey: null,
  externalId: 'CONT_AWD_1',
  piid: 'N6660426P0205',
  recipientName: 'Acme',
  agencyPath: 'Department of Defense.Department of the Navy',
  family: 'contracts',
  naicsCode: '332710',
  amount: 1000,
  endsAt: '2026-08-01',
  daysLeft: 47,
});

const raised = (key: AlertKey, day: number, payload: unknown): RaisedAlert => ({
  key,
  scopeKey: null,
  payload,
  position: 0,
  profileId: 'enfav',
  raisedAt: new Date(`2026-06-${day}T12:00:00Z`),
  eventSeq: String(day),
  promptId: null,
});

describe('the alerts service', () => {
  it('[GOV-33] reads the raised alerts back newest first with the total, each as the alert that was published, and as its key alone when the payload is refused by its kind’s schema or was never kept', async () => {
    const ledger = new InMemoryAlertLedger();
    const ending = { kind: 'award-ending' as const, subject: 'CONT_AWD_1' };
    await ledger.record([
      raised(ending, 10, ENDING),
      // A payload this kind's schema refuses: another kind's.
      raised({ kind: 'award-notice', subject: 'CONT_AWD_1|n-1' }, 11, ENDING),
      // A row from before payloads were kept.
      raised({ kind: 'pulse-above-band', subject: '2026-9' }, 12, null),
    ]);
    const service = new AlertsService(ledger);

    const [views, total] = await service.list({ limit: 10, offset: 0 });
    expect(total).toBe(3);
    expect(views.map((view) => [view.key.kind, view.raisedAt, view.alert?.topic ?? null])).toEqual([
      ['pulse-above-band', '2026-06-12T12:00:00.000Z', null],
      ['award-notice', '2026-06-11T12:00:00.000Z', null],
      ['award-ending', '2026-06-10T12:00:00.000Z', 'govcon.award.ending'],
    ]);
    expect(views[2]).toEqual({
      id: views[2]?.id,
      key: ending,
      profileId: 'enfav',
      raisedAt: '2026-06-10T12:00:00.000Z',
      alert: { topic: 'govcon.award.ending', key: ending, payload: ENDING },
    });

    const [page, same] = await service.list({ limit: 1, offset: 1 });
    expect(same).toBe(3);
    expect(page.map((view) => view.key.kind)).toEqual(['award-notice']);
  });
});
