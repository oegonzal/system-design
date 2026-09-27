import { fetched } from '../../../core/testing';
import { fromRow, toRow } from './opportunity-mapper';

describe('the opportunity mapper', () => {
  const seenAt = new Date('2026-09-26T12:00:00Z');

  it('round-trips a full record exactly, keeping the raw record and stamping both seen-at columns', () => {
    const item = fetched({
      award: { date: null, number: 'A-1', amount: 12.5, awardeeName: 'X', awardeeUei: null },
    });
    const row = toRow(item, seenAt);
    expect(row.raw).toBe(item.raw);
    expect(row.firstSeenAt).toBe(seenAt);
    expect(row.lastSeenAt).toBe(seenAt);
    expect(row.postedAt).toEqual(new Date(item.opportunity.postedAt));
    expect(fromRow(row)).toEqual(item.opportunity);
  });

  it('round-trips a sparse record — every nullable null, every list empty', () => {
    const item = fetched({
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
    expect(fromRow(toRow(item, seenAt))).toEqual(item.opportunity);
  });

  it('copies nested values rather than sharing them', () => {
    const item = fetched();
    const row = toRow(item, seenAt);
    expect(row.pointsOfContact).not.toBe(item.opportunity.pointsOfContact);
    expect(row.naicsCodes).not.toBe(item.opportunity.naicsCodes);
    const back = fromRow(row);
    expect(back.placeOfPerformance).not.toBe(row.placeOfPerformance);
  });
});
