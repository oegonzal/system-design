import { opportunityOf } from '../../../core/testing';
import { fromRow, toRow } from './opportunity-mapper';

describe('the opportunity mapper', () => {
  const seenAt = new Date('2026-09-26T12:00:00Z');

  it('round-trips a full record exactly and stamps both seen-at columns', () => {
    const item = opportunityOf({
      award: { date: null, number: 'A-1', amount: 12.5, awardeeName: 'X', awardeeUei: null },
    });
    const row = toRow(item, seenAt);
    expect(row.firstSeenAt).toBe(seenAt);
    expect(row.lastSeenAt).toBe(seenAt);
    expect(row.postedAt).toEqual(new Date(item.postedAt));
    expect(fromRow(row)).toEqual(item);
  });

  it('round-trips a sparse record — every nullable null, every list empty', () => {
    const item = opportunityOf({
      solicitationNumber: null,
      agencyPath: null,
      agencyCode: null,
      responseDeadlineAt: null,
      archiveAt: null,
      archiveType: null,
      noticeType: null,
      baseType: null,
      active: null,
      naicsCode: null,
      naicsCodes: [],
      classificationCode: null,
      setAsideCode: null,
      setAsideDescription: null,
      organizationType: null,
      placeOfPerformance: null,
      officeAddress: null,
      pointsOfContact: [],
      descriptionUrl: null,
      uiLink: null,
      additionalInfoLink: null,
      resourceLinks: [],
      award: null,
    });
    expect(fromRow(toRow(item, seenAt))).toEqual(item);
  });

  it('copies nested values rather than sharing them', () => {
    const item = opportunityOf();
    const row = toRow(item, seenAt);
    expect(row.pointsOfContact).not.toBe(item.pointsOfContact);
    expect(row.naicsCodes).not.toBe(item.naicsCodes);
    const back = fromRow(row);
    expect(back.placeOfPerformance).not.toBe(row.placeOfPerformance);
  });
});
