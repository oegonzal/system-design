import type {
  TargetActivity,
  TargetContact,
  TargetKind,
  TargetLink,
  TargetStage,
} from '@sysdesign/contracts';

/** What a target is about: its kind, and a UEI or an award's id. */
export interface TargetKey {
  kind: TargetKind;
  subject: string;
}

/** What a save carries; every field is the client's to set. */
export interface TargetInput {
  label: string;
  stage: TargetStage;
  notes: string;
  nextAction: string;
  contacts: TargetContact[];
  links: TargetLink[];
  activity: TargetActivity[];
  reminderAt: Date | null;
}

export interface TargetRecord extends TargetKey, TargetInput {
  id: string;
  /** An award's end as the warm last read it, ISO date; null for a firm, and for an award not read yet. */
  endsAt: string | null;
  stageChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TargetFilter {
  kind: TargetKind | null;
  stage: TargetStage | null;
  limit: number;
  offset: number;
}

/** Targets keyed by what they are about: at most one per kind and subject. */
export interface TargetRepository {
  find(key: TargetKey): Promise<TargetRecord | null>;
  /** Insert or replace; `stageChangedAt` is `at` when the stage is new or changed, else kept, and `endsAt` is never a save's to set. */
  save(key: TargetKey, input: TargetInput, at: Date): Promise<TargetRecord>;
  remove(key: TargetKey): Promise<boolean>;
  /** Newest change first, with the total over the filter. */
  list(filter: TargetFilter): Promise<[TargetRecord[], number]>;
  /** Every target — the list is human-sized. */
  listAll(): Promise<TargetRecord[]>;
  /** What the warm read of an award's end; false when nothing of that key is tracked. Touches nothing else. */
  observe(key: TargetKey, endsAt: string | null): Promise<boolean>;
}
