import type {
  AdvisorDescriptor,
  UnitAdvice,
  UnitAdviceRequest,
  UnitLookup,
  UnitLookupRequest,
} from '@sysdesign/contracts';

/** What the advisor routes read: who the service is, what it has on record for one request, and what for one identity. */
export const RECORD_SOURCE = Symbol('RECORD_SOURCE');

export interface RecordSource {
  describe(): AdvisorDescriptor;
  unitsOnRecord(request: UnitAdviceRequest): Promise<UnitAdvice>;
  unitOnRecord(request: UnitLookupRequest): Promise<UnitLookup>;
}
