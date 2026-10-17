/**
 * The write path. A write is drafted from a typed candidate, resolved against
 * the current record it may reconcile with, reconciled by the one rule every
 * kind shares, committed in one transaction, then projected — Postgres first,
 * the index after.
 *
 *   remember    asserts a candidate: it inserts, leaves a record that already
 *               says the same unchanged, or supersedes the current one;
 *   update      supersedes an addressed, current record, keeping its identity
 *               and scope — it never inserts;
 *   invalidate  closes an addressed, current record with its reason;
 *   history     reads every version of the record's identity.
 *
 * Every verb addressed to a record by id answers "not found" for a record the
 * caller's scope cannot see, so a record's existence does not leak across
 * scopes. `writeDerived` is the path consolidation writes through: no verb
 * check, and the record carries the evidence it was derived from.
 */
import type {
  invalidateRecordRequestSchema,
  MemoryRecordDto,
  OperationVerb,
  RecordScope,
  recordHistoryRequestSchema,
  rememberRequestSchema,
  updateRecordRequestSchema,
  WriteOutcome,
  WriteResultDto,
} from '@sysdesign/contracts';
import { canonicalArguments } from '@sysdesign/contracts';
import type { z } from 'zod';

import { recordDto } from '../dto';
import { contentHashOf, contentOf, identityOf, keysOf } from '../kinds/behavior';
import type { Closing, Evidence, MemoryRecord, MemoryPorts, RecordChange } from '../ports';
import { refuse } from '../refusal';
import type { CompiledRegister, CompiledSpace } from '../space/compile';
import { checkScope, visibleTo } from '../space/scope';
import { project, unproject } from './projection';

export interface SpaceContext {
  ports: MemoryPorts;
  spaceId: string;
  space: CompiledSpace;
}

type RememberRequest = z.output<typeof rememberRequestSchema>;
type UpdateRequest = z.output<typeof updateRecordRequestSchema>;
type InvalidateRequest = z.output<typeof invalidateRecordRequestSchema>;
type HistoryRequest = z.output<typeof recordHistoryRequestSchema>;

/** Who a consolidated record says produced it. */
const CONSOLIDATION_SOURCE = 'consolidation';

/** The register a verb is addressed to; a name the space does not keep, or a verb it does not declare, is refused. */
export function registerFor(
  space: CompiledSpace,
  name: string,
  verb: OperationVerb,
): CompiledRegister {
  const register = space.registers.get(name);
  if (register === undefined)
    refuse('register.unknown', `the space keeps no register named ${name}`);
  if (!register.operations.has(verb))
    refuse('operation.undeclared', `register ${name} declares no ${verb}`);
  return register;
}

/** The partition a request's scope names; a scope without it, or with an undeclared key, is refused. */
export function partitionOf(space: CompiledSpace, scope: RecordScope): string {
  const check = checkScope(scope, space.policy.scopeKeys);
  if (!check.ok) refuse('scope.invalid', check.message);
  return check.partition;
}

function parseCandidate(register: CompiledRegister, candidate: unknown): Record<string, unknown> {
  const parsed = register.behavior.candidate.safeParse(candidate);
  if (!parsed.success) {
    refuse(
      'candidate.invalid',
      `the candidate is not a ${register.kind} memory`,
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

function checkMetadata(
  register: CompiledRegister,
  metadata: Readonly<Record<string, string>>,
): void {
  const undeclared = Object.keys(metadata).filter(
    (field) => !register.metadataFields.includes(field),
  );
  if (undeclared.length > 0) {
    refuse(
      'metadata.undeclared',
      `register ${register.name} declares no metadata ${undeclared.join(', ')}`,
    );
  }
}

interface DraftInput {
  register: CompiledRegister;
  scope: RecordScope;
  partition: string;
  body: Record<string, unknown>;
  metadata: Readonly<Record<string, string>>;
  provenance: { source: string; sourceRunId: string | null };
  evidence: Evidence | null;
}

function draft({ ports, spaceId }: SpaceContext, input: DraftInput): MemoryRecord {
  const { register, body } = input;
  const now = ports.clock();
  const id = ports.ids();
  const field = register.behavior.validFrom;
  const declaredFrom = field === null ? null : body[field];
  return {
    id,
    spaceId,
    register: register.name,
    kind: register.kind,
    partition: input.partition,
    scope: { ...input.scope },
    identity: identityOf(register.behavior, body),
    keys: keysOf(register.behavior, body),
    body,
    metadata: { ...input.metadata },
    text: register.behavior.text(body),
    contentHash: contentHashOf({
      register: register.name,
      scope: input.scope,
      body,
      ...input.provenance,
    }),
    status: 'active',
    version: 1,
    supersedesId: null,
    lineageId: id,
    validFrom: typeof declaredFrom === 'string' ? new Date(declaredFrom) : now,
    validTo: null,
    recordedAt: now,
    expiresAt:
      register.ttlSeconds === null ? null : new Date(now.getTime() + register.ttlSeconds * 1_000),
    closedAt: null,
    closeReason: null,
    support: input.evidence?.support ?? 1,
    provenance: { ...input.provenance, derivedFrom: [...(input.evidence?.derivedFrom ?? [])] },
    projectedInto: null,
  };
}

export interface Reconciled {
  outcome: WriteOutcome;
  record: MemoryRecord;
  /** The record this write closed, as it stood before; null unless the outcome is `superseded`. */
  previous: MemoryRecord | null;
  change: RecordChange | null;
}

/** What a record says: its content and its declared metadata. A write that says the same leaves it unchanged. */
const sayingOf = (register: CompiledRegister, record: MemoryRecord): string =>
  `${contentOf(register.behavior, record.body)}|${canonicalArguments({ ...record.metadata })}`;

const inserted = (next: MemoryRecord): Reconciled => ({
  outcome: 'inserted',
  record: next,
  previous: null,
  change: { insert: next, close: null },
});

/** The next version of a current record — or the record left as it is, when the next one says the same. */
function successor(
  register: CompiledRegister,
  current: MemoryRecord,
  next: MemoryRecord,
): Reconciled {
  if (sayingOf(register, current) === sayingOf(register, next)) {
    return { outcome: 'unchanged', record: current, previous: null, change: null };
  }
  const record: MemoryRecord = {
    ...next,
    version: current.version + 1,
    supersedesId: current.id,
    lineageId: current.lineageId,
  };
  const closing: Closing = {
    status: 'superseded',
    validTo: new Date(Math.max(current.validFrom.getTime(), next.validFrom.getTime())),
    closedAt: next.recordedAt,
    reason: null,
  };
  return {
    outcome: 'superseded',
    record,
    previous: current,
    change: { insert: record, close: { id: current.id, closing } },
  };
}

async function reconcile(
  ctx: SpaceContext,
  register: CompiledRegister,
  next: MemoryRecord,
): Promise<Reconciled> {
  const slot = { spaceId: ctx.spaceId, register: register.name, scope: next.scope };
  if (next.identity === null) {
    const same = await ctx.ports.records.current({ ...slot, contentHash: next.contentHash });
    return same === null
      ? inserted(next)
      : { outcome: 'unchanged', record: same, previous: null, change: null };
  }
  const current = await ctx.ports.records.current({ ...slot, identity: next.identity });
  return current === null ? inserted(next) : successor(register, current, next);
}

/** Reconcile and commit; a write that lost a race is re-resolved once against what won, then refused. */
async function commit(
  ctx: SpaceContext,
  register: CompiledRegister,
  next: MemoryRecord,
): Promise<Reconciled> {
  for (const attempt of [1, 2]) {
    const reconciled = await reconcile(ctx, register, next);
    if (reconciled.change === null) return reconciled;
    if ((await ctx.ports.records.commit(reconciled.change)) === 'committed') return reconciled;
    if (attempt === 2) break;
  }
  return refuse(
    'conflict',
    `another write to register ${register.name} landed first; send it again`,
  );
}

const closed = (record: MemoryRecord, closing: Closing): MemoryRecord => ({
  ...record,
  status: closing.status,
  validTo: closing.validTo,
  closedAt: closing.closedAt,
  closeReason: closing.reason,
});

/** Project what a write committed, remove the point of what it closed, and answer the write. */
async function settle(
  ctx: SpaceContext,
  register: CompiledRegister,
  reconciled: Reconciled,
): Promise<WriteResultDto> {
  let record = reconciled.record;
  if (reconciled.change !== null && register.behavior.projected) {
    const outcome = await project(ctx.ports, [record]);
    if (outcome.projected.length > 0)
      record = { ...record, projectedInto: ctx.ports.index.collection };
  }
  const previous = reconciled.previous;
  const closing = reconciled.change?.close?.closing;
  if (previous !== null && previous.projectedInto !== null)
    await unproject(ctx.ports, [previous.id]);
  return {
    outcome: reconciled.outcome,
    record: recordDto(record),
    superseded:
      previous === null || closing === undefined
        ? null
        : recordDto({ ...closed(previous, closing), projectedInto: null }),
    projected: record.projectedInto !== null,
  };
}

export async function remember(
  ctx: SpaceContext,
  request: RememberRequest,
): Promise<WriteResultDto> {
  const register = registerFor(ctx.space, request.register, 'remember');
  const partition = partitionOf(ctx.space, request.scope);
  const body = parseCandidate(register, request.candidate);
  checkMetadata(register, request.metadata);
  const next = draft(ctx, {
    register,
    scope: request.scope,
    partition,
    body,
    metadata: request.metadata,
    provenance: request.provenance,
    evidence: null,
  });
  return settle(ctx, register, await commit(ctx, register, next));
}

/** A record the caller addressed by id, refused as not found when the caller's scope cannot see it. */
async function addressed(
  ctx: SpaceContext,
  recordId: string,
  scope: RecordScope,
): Promise<MemoryRecord> {
  partitionOf(ctx.space, scope);
  const record = await ctx.ports.records.get(ctx.spaceId, recordId);
  if (record === null || !visibleTo(record.scope, scope)) {
    refuse('record.not_found', `no record ${recordId} is visible in this scope`);
  }
  return record;
}

export async function update(ctx: SpaceContext, request: UpdateRequest): Promise<WriteResultDto> {
  const current = await addressed(ctx, request.recordId, request.scope);
  const register = registerFor(ctx.space, current.register, 'update');
  if (current.status !== 'active') {
    refuse(
      'record.not_current',
      `record ${current.id} is ${current.status}; update its current version`,
    );
  }
  const body = parseCandidate(register, request.candidate);
  const metadata = request.metadata ?? current.metadata;
  checkMetadata(register, metadata);
  const next = draft(ctx, {
    register,
    scope: current.scope,
    partition: current.partition,
    body,
    metadata,
    provenance: request.provenance,
    evidence: null,
  });
  if (next.identity !== current.identity) {
    refuse(
      'identity.mismatch',
      `an update keeps the record's identity (${register.behavior.identity.join(', ')})`,
    );
  }
  const reconciled = successor(register, current, next);
  if (
    reconciled.change !== null &&
    (await ctx.ports.records.commit(reconciled.change)) === 'conflict'
  ) {
    refuse('conflict', `record ${current.id} changed while it was being updated`);
  }
  return settle(ctx, register, reconciled);
}

export async function invalidate(
  ctx: SpaceContext,
  request: InvalidateRequest,
): Promise<MemoryRecordDto> {
  const current = await addressed(ctx, request.recordId, request.scope);
  registerFor(ctx.space, current.register, 'invalidate');
  const now = ctx.ports.clock();
  const closing: Closing = {
    status: 'invalidated',
    validTo: now,
    closedAt: now,
    reason: request.reason,
  };
  if ((await ctx.ports.records.close(current.id, closing)) === 'conflict') {
    refuse('record.not_current', `record ${current.id} is no longer current`);
  }
  if (current.projectedInto !== null) await unproject(ctx.ports, [current.id]);
  return recordDto({ ...closed(current, closing), projectedInto: null });
}

export async function history(
  ctx: SpaceContext,
  request: HistoryRequest,
): Promise<MemoryRecordDto[]> {
  const record = await addressed(ctx, request.recordId, request.scope);
  registerFor(ctx.space, record.register, 'recall');
  return (await ctx.ports.records.lineage(ctx.spaceId, record.lineageId)).map(recordDto);
}

/** A lesson or a playbook consolidation derived, written with the evidence it was derived from. */
export async function writeDerived(
  ctx: SpaceContext,
  register: CompiledRegister,
  input: { scope: RecordScope; candidate: Record<string, unknown>; evidence: Evidence },
): Promise<Reconciled> {
  const partition = partitionOf(ctx.space, input.scope);
  const body = parseCandidate(register, input.candidate);
  const next = draft(ctx, {
    register,
    scope: input.scope,
    partition,
    body,
    metadata: {},
    provenance: { source: CONSOLIDATION_SOURCE, sourceRunId: null },
    evidence: input.evidence,
  });
  const reconciled = await commit(ctx, register, next);
  await settle(ctx, register, reconciled);
  return reconciled;
}
