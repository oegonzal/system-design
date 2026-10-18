/**
 * Consolidation: a deterministic function of the verified episodes in scope,
 * recomputed whole on every pass, so a pass over the same evidence changes
 * nothing and a pass over more evidence counts all of it.
 *
 *   group      the episodes whose verified outcome proposes a lesson, by their
 *              exact scope and the lesson's declared key (scopes never merge);
 *   support    the number of distinct source runs behind a group;
 *   lessons    a group with at least `minSupport` becomes a lesson in the lesson
 *              register, citing its episodes; one already standing is
 *              reinforced in place when its evidence changed, superseded when
 *              its text did, and withdrawn when its support fell short;
 *   playbooks  lessons with at least `promoteAt` support that name a playbook
 *              become its rules — every qualifying lesson, sorted by key — and
 *              a playbook gets a new version only when those rules change.
 *
 * What consolidation wrote is known by what it wrote (a non-empty
 * `derivedFrom`), never by reading the records' prose.
 */
import type {
  ConsolidationEntryDto,
  ConsolidationRoute,
  ConsolidationResultDto,
  consolidateRequestSchema,
  MemoryLesson,
  RecordScope,
} from '@sysdesign/contracts';
import type { z } from 'zod';

import { byText } from '../order';
import type { Closing, MemoryRecord } from '../ports';
import { refuse } from '../refusal';
import type { CompiledRegister } from '../space/compile';
import { canonicalScope } from '../space/scope';
import { unproject } from '../write/projection';
import { partitionOf, writeDerived, type Reconciled, type SpaceContext } from '../write/write';

type ConsolidateRequest = z.output<typeof consolidateRequestSchema>;

/** Why consolidation closed a lesson or a playbook it had written. */
const SUPPORT_WITHDRAWN = 'support_withdrawn';

interface LessonGroup {
  scope: RecordScope;
  lesson: MemoryLesson;
  support: number;
  episodes: string[];
}

const latestFirst = (a: MemoryRecord, b: MemoryRecord): number =>
  b.validFrom.getTime() - a.validFrom.getTime() ||
  b.recordedAt.getTime() - a.recordedAt.getTime() ||
  byText(a.id, b.id);

const slotOf = (scope: RecordScope, key: string): string => `${canonicalScope(scope)}|${key}`;

/** Where a derived record stands: its scope and its identity, as the kind declares it. */
const standingOf = (record: MemoryRecord): string =>
  slotOf(record.scope, record.identity ?? record.id);

const registerOf = (ctx: SpaceContext, name: string): CompiledRegister => {
  const register = ctx.space.registers.get(name);
  if (register === undefined)
    return refuse('consolidation.unavailable', `register ${name} is not in the space`);
  return register;
};

function groupLessons(ctx: SpaceContext, episodes: readonly MemoryRecord[]): LessonGroup[] {
  const groups = new Map<string, MemoryRecord[]>();
  for (const episode of episodes) {
    const lesson = ctx.space.registers.get(episode.register)?.behavior.lessonOf?.(episode.body);
    if (lesson === undefined || lesson === null) continue;
    const slot = slotOf(episode.scope, lesson.key);
    groups.set(slot, [...(groups.get(slot) ?? []), episode]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => byText(a, b))
    .flatMap(([, members]) => {
      const [latest] = [...members].sort(latestFirst);
      const lesson =
        latest === undefined
          ? null
          : ctx.space.registers.get(latest.register)?.behavior.lessonOf?.(latest.body);
      if (latest === undefined || lesson === undefined || lesson === null) return [];
      const runs = new Set(members.flatMap((member) => member.provenance.sourceRunId ?? []));
      return [
        {
          scope: latest.scope,
          lesson,
          support: runs.size,
          episodes: members.map((member) => member.id).sort(byText),
        },
      ];
    });
}

const sameEvidence = (
  record: MemoryRecord,
  support: number,
  derivedFrom: readonly string[],
): boolean =>
  record.support === support && record.provenance.derivedFrom.join() === derivedFrom.join();

/** Write one derived record with its evidence; an unchanged one whose evidence moved is reinforced in place. */
async function derive(
  ctx: SpaceContext,
  register: CompiledRegister,
  scope: RecordScope,
  candidate: Record<string, unknown>,
  evidence: { support: number; derivedFrom: string[] },
): Promise<{ written: Reconciled; outcome: ConsolidationEntryDto['outcome'] }> {
  const written = await writeDerived(ctx, register, { scope, candidate, evidence });
  if (
    written.outcome !== 'unchanged' ||
    sameEvidence(written.record, evidence.support, evidence.derivedFrom)
  ) {
    return { written, outcome: written.outcome };
  }
  await ctx.ports.records.reinforce(written.record.id, evidence);
  return { written, outcome: 'reinforced' };
}

/** Close every record consolidation wrote in a register that this pass did not write again. */
async function withdraw(
  ctx: SpaceContext,
  register: CompiledRegister,
  scope: RecordScope,
  partition: string,
  standing: ReadonlySet<string>,
): Promise<ConsolidationEntryDto[]> {
  const now = ctx.ports.clock();
  const derived = (
    await ctx.ports.records.find({
      spaceId: ctx.spaceId,
      registers: [register.name],
      partition,
      scope,
      scopeMode: 'within',
      now,
      limit: null,
    })
  ).filter((record) => record.provenance.derivedFrom.length > 0);
  const entries: ConsolidationEntryDto[] = [];
  for (const record of derived) {
    if (standing.has(standingOf(record))) continue;
    const closing: Closing = {
      status: 'invalidated',
      validTo: now,
      closedAt: now,
      reason: SUPPORT_WITHDRAWN,
    };
    if ((await ctx.ports.records.close(record.id, closing)) === 'closed') {
      if (record.projectedInto !== null) await unproject(ctx.ports, [record.id]);
      entries.push({
        scope: record.scope,
        key: record.keys.join(' '),
        outcome: 'withdrawn',
        recordId: record.id,
        support: record.support,
        version: record.version,
      });
    }
  }
  return entries;
}

const entryOf = (
  scope: RecordScope,
  key: string,
  derived: { written: Reconciled; outcome: ConsolidationEntryDto['outcome'] },
  support: number,
): ConsolidationEntryDto => ({
  scope,
  key,
  outcome: derived.outcome,
  recordId: derived.written.record.id,
  support,
  version: derived.written.record.version,
});

async function promote(
  ctx: SpaceContext,
  plan: ConsolidationRoute & { playbooks: string },
  qualifying: readonly { group: LessonGroup; recordId: string }[],
  scope: RecordScope,
  partition: string,
): Promise<ConsolidationEntryDto[]> {
  const register = registerOf(ctx, plan.playbooks);
  const promoted = new Map<
    string,
    { scope: RecordScope; name: string; members: { group: LessonGroup; recordId: string }[] }
  >();
  for (const member of qualifying) {
    const name = member.group.lesson.playbook;
    if (name === null || member.group.support < ctx.space.policy.consolidation.promoteAt) continue;
    const slot = slotOf(member.group.scope, name);
    const playbook = promoted.get(slot) ?? { scope: member.group.scope, name, members: [] };
    playbook.members.push(member);
    promoted.set(slot, playbook);
  }
  const entries: ConsolidationEntryDto[] = [];
  const standing = new Set<string>();
  for (const [, playbook] of [...promoted.entries()].sort(([a], [b]) => byText(a, b))) {
    const candidate = register.behavior.fromLessons?.(
      playbook.name,
      playbook.members.map(({ group }) => group.lesson),
    );
    if (candidate === undefined) continue;
    const support = Math.min(...playbook.members.map(({ group }) => group.support));
    const derivedFrom = playbook.members.map(({ recordId }) => recordId).sort(byText);
    const derived = await derive(ctx, register, playbook.scope, candidate, {
      support,
      derivedFrom,
    });
    standing.add(standingOf(derived.written.record));
    entries.push(entryOf(playbook.scope, playbook.name, derived, support));
  }
  return [...entries, ...(await withdraw(ctx, register, scope, partition, standing))];
}

export async function consolidate(
  ctx: SpaceContext,
  request: ConsolidateRequest,
): Promise<ConsolidationResultDto> {
  const plan = ctx.space.consolidation;
  if (plan === null) {
    refuse(
      'consolidation.unavailable',
      'the space has no consolidation route; its compile report says why',
    );
  }
  const partition = partitionOf(ctx.space, request.scope);
  const lessonsRegister = registerOf(ctx, plan.lessons);
  const episodes = await ctx.ports.records.find({
    spaceId: ctx.spaceId,
    registers: plan.sources,
    partition,
    scope: request.scope,
    scopeMode: 'within',
    now: ctx.ports.clock(),
    limit: null,
  });
  const groups = groupLessons(ctx, episodes);

  const lessons: ConsolidationEntryDto[] = [];
  const qualifying: { group: LessonGroup; recordId: string }[] = [];
  const standing = new Set<string>();
  for (const group of groups.filter(
    ({ support }) => support >= ctx.space.policy.consolidation.minSupport,
  )) {
    const candidate = lessonsRegister.behavior.fromLesson?.(group.lesson);
    if (candidate === undefined) continue;
    const derived = await derive(ctx, lessonsRegister, group.scope, candidate, {
      support: group.support,
      derivedFrom: group.episodes,
    });
    lessons.push(entryOf(group.scope, group.lesson.key, derived, group.support));
    qualifying.push({ group, recordId: derived.written.record.id });
    standing.add(standingOf(derived.written.record));
  }
  lessons.push(...(await withdraw(ctx, lessonsRegister, request.scope, partition, standing)));

  const playbooks =
    plan.playbooks === null
      ? []
      : await promote(
          ctx,
          { ...plan, playbooks: plan.playbooks },
          qualifying,
          request.scope,
          partition,
        );
  return { groups: groups.length, lessons, playbooks };
}
