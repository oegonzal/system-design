import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  ApplicationDto,
  CompanyDto,
  CorrectableStatus,
  CreateApplicationRequest,
} from '@sysdesign/contracts';

import { CLOCK, type Clock } from '../common/clock';
import { applicationDto, companyKey, movedAt, type Application } from './application';
import { APPLICATION_STORE, type ApplicationStore } from './ports';
import type { ApplicationsQueryInput } from './requests';

/** The record's own routes: what a person reads of it, enters into it by hand, and corrects. */
@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(APPLICATION_STORE) private readonly store: ApplicationStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: ApplicationsQueryInput): Promise<ApplicationDto[]> {
    const rows = await this.store.list({
      subject: query.subject,
      ...(query.company === undefined ? {} : { company: query.company }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.since === undefined ? {} : { since: new Date(query.since) }),
      limit: query.limit,
      offset: query.offset,
    });
    return rows.map(applicationDto);
  }

  /** Every company the subject has a record with, latest first: how many applications, and what the latest stands as. */
  async companies(subject: string): Promise<CompanyDto[]> {
    const rows = await this.store.since(subject, new Date(0));
    const byKey = new Map<string, Application[]>();
    for (const row of rows)
      byKey.set(row.identityKey, [...(byKey.get(row.identityKey) ?? []), row]);
    return [...byKey.values()]
      .map((group) => {
        const [latest] = group;
        if (latest === undefined) throw new Error('an empty group');
        return {
          company: latest.company,
          applications: group.length,
          latestAt: movedAt(latest).toISOString(),
          status: latest.status,
        };
      })
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  }

  /** An application made outside a session, or before the record existed: entered as a person says it was. */
  async enter(request: CreateApplicationRequest): Promise<ApplicationDto> {
    const at = request.appliedAt === undefined ? this.clock() : new Date(request.appliedAt);
    const application: Application = {
      id: randomUUID(),
      subject: request.subject,
      company: request.company,
      identityKey: companyKey(request.company),
      label: request.label ?? request.company,
      url: request.url ?? null,
      source: 'manual',
      sessionId: null,
      profile: null,
      unitOrdinal: null,
      status: request.status ?? 'submitted',
      openedAt: at,
      closedAt: at,
      expiresAt: null,
    };
    await this.store.insert(application);
    return applicationDto(application);
  }

  /** The operator's decision the engine cannot make: a unit left in progress confirmed as submitted, or one released that never was. */
  async correct(id: string, status: CorrectableStatus): Promise<ApplicationDto | null> {
    const existing = await this.store.find(id);
    if (existing === null) return null;
    await this.store.setStatus(id, status, this.clock());
    const corrected = await this.store.find(id);
    return corrected === null ? null : applicationDto(corrected);
  }
}
