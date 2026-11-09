import { describe, expect, it } from 'vitest';

import {
  ADVISOR_ROUTES,
  advisorDescriptorSchema,
  unitAdviceRequestSchema,
  unitAdviceSchema,
  unitLookupRequestSchema,
  unitLookupSchema,
} from './advice';
import { ADVICE_UNITS_BOUND } from './vocab';

const asker = { kind: 'browser-session', id: 'session-1', label: 'step 3' };
const unit = {
  identity: [{ name: 'company', value: 'Acme' }],
  stance: 'avoid',
  note: 'applied 2026-10-03, 2 applications',
};

describe('the advisor protocol', () => {
  it('[BRW-14] reads a descriptor, a request and an advice as declared, and refuses what they do not declare', () => {
    expect(advisorDescriptorSchema.parse({ id: 'record', facets: ['company'] })).toEqual({
      id: 'record',
      facets: ['company'],
    });
    expect(advisorDescriptorSchema.safeParse({ id: '', facets: ['company'] }).success).toBe(false);

    const request = { subject: 'Alex Example', asker, facets: ['company'] };
    expect(unitAdviceRequestSchema.parse(request)).toEqual(request);
    // A request carries no limit: both sides read the bound from the contracts.
    expect(unitAdviceRequestSchema.safeParse({ ...request, limit: 10 }).success).toBe(false);
    expect(unitAdviceRequestSchema.safeParse({ ...request, subject: '' }).success).toBe(false);
    expect(
      unitAdviceRequestSchema.safeParse({ ...request, asker: { ...asker, kind: 'robot' } }).success,
    ).toBe(false);

    expect(unitAdviceSchema.parse({ advisor: 'record', units: [unit], omitted: 0 })).toEqual({
      advisor: 'record',
      units: [unit],
      omitted: 0,
    });
    expect(
      unitAdviceSchema.safeParse({
        advisor: 'record',
        units: [{ ...unit, stance: 'maybe' }],
        omitted: 0,
      }).success,
    ).toBe(false);
    expect(unitAdviceSchema.safeParse({ advisor: 'record', units: [], omitted: -1 }).success).toBe(
      false,
    );
    const past = Array.from({ length: ADVICE_UNITS_BOUND.ceiling + 1 }, () => unit);
    expect(unitAdviceSchema.safeParse({ advisor: 'record', units: past, omitted: 0 }).success).toBe(
      false,
    );
  });

  it('[BRW-14] reads a lookup of one identity and its answer, a unit or nothing, on a route of its own', () => {
    expect(ADVISOR_ROUTES.lookup).not.toBe(ADVISOR_ROUTES.advice);
    const request = {
      subject: 'Alex Example',
      asker,
      facets: ['company'],
      identity: unit.identity,
    };
    expect(unitLookupRequestSchema.parse(request)).toEqual(request);
    // A lookup names an identity: without one it is the advice request, which asks for the whole record.
    expect(unitLookupRequestSchema.safeParse({ ...request, identity: [] }).success).toBe(false);
    expect(unitLookupRequestSchema.safeParse({ ...request, identity: undefined }).success).toBe(
      false,
    );
    expect(unitLookupSchema.parse({ advisor: 'record', unit })).toEqual({
      advisor: 'record',
      unit,
    });
    expect(unitLookupSchema.parse({ advisor: 'record', unit: null })).toEqual({
      advisor: 'record',
      unit: null,
    });
    expect(unitLookupSchema.safeParse({ advisor: 'record' }).success).toBe(false);
  });
});
