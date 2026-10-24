import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  isTargetStage,
  TARGET_STAGES,
  type SaveTargetRequest,
  type Target,
  type TargetSummary,
} from '@sysdesign/contracts';

import type { TargetFilter, TargetKey, TargetRecord, TargetRepository } from '../../core/ports';
import { summarizeTargets } from '../../core/targets';
import { CLOCK } from '../sources/tokens';
import { TARGET_REPOSITORY } from './tokens';

const toTarget = (record: TargetRecord): Target => ({
  id: record.id,
  kind: record.kind,
  subject: record.subject,
  label: record.label,
  stage: record.stage,
  notes: record.notes,
  nextAction: record.nextAction,
  contacts: record.contacts,
  links: record.links,
  activity: record.activity,
  reminderAt: record.reminderAt?.toISOString() ?? null,
  endsAt: record.endsAt,
  stageChangedAt: record.stageChangedAt.toISOString(),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

/**
 * What the company pursues that is not a notice: one row per firm or award.
 * A save is refused before any write when the stage is not one of the
 * kind's own; omitted fields keep their value, a list given replaces the
 * whole list; the stage's timestamp moves only with the stage. Nothing here reads a source: what a target is called
 * is the caller's to say.
 */
@Injectable()
export class TargetsService {
  constructor(
    @Inject(TARGET_REPOSITORY) private readonly targets: TargetRepository,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** Null when nothing of that kind and subject is tracked. */
  async get(key: TargetKey): Promise<Target | null> {
    const record = await this.targets.find(key);
    return record === null ? null : toTarget(record);
  }

  async save(key: TargetKey, request: SaveTargetRequest): Promise<Target> {
    if (!isTargetStage(key.kind, request.stage)) {
      throw new BadRequestException(
        `${request.stage} is not a stage of a ${key.kind}: ${TARGET_STAGES[key.kind].join(', ')}`,
      );
    }
    const existing = await this.targets.find(key);
    const record = await this.targets.save(
      key,
      {
        label: request.label,
        stage: request.stage,
        notes: request.notes ?? existing?.notes ?? '',
        nextAction: request.nextAction ?? existing?.nextAction ?? '',
        contacts: request.contacts ?? existing?.contacts ?? [],
        links: request.links ?? existing?.links ?? [],
        activity: request.activity ?? existing?.activity ?? [],
        reminderAt:
          request.reminderAt === undefined
            ? (existing?.reminderAt ?? null)
            : request.reminderAt === null
              ? null
              : new Date(request.reminderAt),
      },
      this.now(),
    );
    return toTarget(record);
  }

  async remove(key: TargetKey): Promise<void> {
    if (!(await this.targets.remove(key))) {
      throw new NotFoundException(`no ${key.kind} target ${key.subject}`);
    }
  }

  /** Newest change first. */
  async list(filter: TargetFilter): Promise<[Target[], number]> {
    const [rows, total] = await this.targets.list(filter);
    return [rows.map(toTarget), total];
  }

  async summary(): Promise<TargetSummary> {
    return summarizeTargets(await this.targets.listAll(), this.now().getTime());
  }
}
