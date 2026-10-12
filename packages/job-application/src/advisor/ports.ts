import type { AdvisorDescriptor, UnitAdvice, UnitAdviceRequest } from '@sysdesign/contracts';

/** What the advisor routes read: who the service is, and what it has on record for one request. */
export const RECORD_SOURCE = Symbol('RECORD_SOURCE');

export interface RecordSource {
  describe(): AdvisorDescriptor;
  unitsOnRecord(request: UnitAdviceRequest): Promise<UnitAdvice>;
}
