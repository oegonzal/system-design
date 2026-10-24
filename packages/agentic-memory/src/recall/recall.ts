/**
 * Recall: hybrid retrieval routed by what the request declares, never by
 * reading the query. A `key` runs the exact route, a `text` the semantic route,
 * and both merge into one ranking; a time range filters every route and runs
 * alone (temporal) only when nothing else is named. Scope, time and metadata
 * filter every route alike. A semantic hit is a candidate until Postgres
 * confirms its record is current, unexpired and visible — a stale point is
 * dropped and counted, never served — and a route that cannot run says why.
 */
import {
  errorMessage,
  type RecallResultDto,
  type RecallRoute,
  type RecallRouteDto,
  type recallRecordsRequestSchema,
  type RouteSkip,
} from '@sysdesign/contracts';
import type { z } from 'zod';

import { recordDto } from '../dto';
import { byText } from '../order';
import type { MemoryRecord, RecordQuery } from '../ports';
import { refuse } from '../refusal';
import type { CompiledRegister } from '../space/compile';
import { partitionOf, registerFor, type SpaceContext } from '../write/write';
import { fill, rank, type Candidate } from './rank';

type RecallRequest = z.output<typeof recallRecordsRequestSchema>;

function recallRegisters(ctx: SpaceContext, request: RecallRequest): CompiledRegister[] {
  if (request.registers !== null) {
    return request.registers.map((name) => registerFor(ctx.space, name, 'recall'));
  }
  return [...ctx.space.registers.values()].filter((register) => register.operations.has('recall'));
}

type SemanticRoute = { hits: { record: MemoryRecord; score: number }[]; route: RecallRouteDto };

async function semanticRoute(
  ctx: SpaceContext,
  registers: readonly CompiledRegister[],
  base: Omit<RecordQuery, 'limit'>,
  text: string,
): Promise<SemanticRoute> {
  const projected = registers
    .filter((register) => register.behavior.projected)
    .map((register) => register.name);
  const skipped = (reason: RouteSkip): SemanticRoute => ({
    hits: [],
    route: { route: 'semantic', registers: projected, hits: 0, dropped: 0, skipped: reason },
  });
  if (projected.length === 0) return skipped('no_projected_register');
  if (ctx.ports.embedder.model === null || ctx.ports.index.collection === null) {
    return skipped('embedder_disabled');
  }
  const vectors = await ctx.ports.embedder.embed([text]);
  const vector = vectors?.[0];
  if (vector === undefined) return skipped('embedding_failed');
  let points: { id: string; score: number }[];
  try {
    points = await ctx.ports.index.search({
      vector,
      limit: ctx.space.policy.recall.maxItems,
      filter: { ...base, registers: projected, scopeKeys: ctx.space.policy.scopeKeys },
    });
  } catch (error) {
    ctx.ports.warn(`recall: the index refused a search: ${errorMessage(error)}`);
    return skipped('index_failed');
  }
  const current = await ctx.ports.records.find({
    ...base,
    registers: projected,
    ids: points.map((point) => point.id),
    limit: null,
  });
  const byId = new Map(current.map((record) => [record.id, record]));
  const hits = points.flatMap((point) => {
    const record = byId.get(point.id);
    return record === undefined ? [] : [{ record, score: point.score }];
  });
  return {
    hits,
    route: {
      route: 'semantic',
      registers: projected,
      hits: points.length,
      dropped: points.length - hits.length,
      skipped: null,
    },
  };
}

export async function recall(ctx: SpaceContext, request: RecallRequest): Promise<RecallResultDto> {
  const registers = recallRegisters(ctx, request);
  const partition = partitionOf(ctx.space, request.scope);
  const filterable = new Set(registers.flatMap((register) => register.metadataFields));
  const undeclared = Object.keys(request.where).filter((field) => !filterable.has(field));
  if (undeclared.length > 0) {
    refuse(
      'metadata.undeclared',
      `no register recalled declares metadata ${undeclared.join(', ')}`,
    );
  }

  const now = ctx.ports.clock();
  const names = registers.map((register) => register.name);
  const base: Omit<RecordQuery, 'limit'> = {
    spaceId: ctx.spaceId,
    registers: names,
    partition,
    scope: request.scope,
    scopeMode: 'visible',
    now,
    ...(request.since === null ? {} : { since: new Date(request.since) }),
    ...(request.until === null ? {} : { until: new Date(request.until) }),
    where: request.where,
  };
  const limit = ctx.space.policy.recall.maxItems;
  const candidates = new Map<
    string,
    { record: MemoryRecord; similarity: number; routes: Set<RecallRoute> }
  >();
  const found = (record: MemoryRecord, route: RecallRoute, similarity = 0) => {
    const seen = candidates.get(record.id) ?? {
      record,
      similarity: 0,
      routes: new Set<RecallRoute>(),
    };
    seen.routes.add(route);
    seen.similarity = Math.max(seen.similarity, similarity);
    candidates.set(record.id, seen);
  };
  const routes: RecallRouteDto[] = [];

  if (request.key !== null) {
    const exact = await ctx.ports.records.find({ ...base, key: request.key, limit });
    exact.forEach((record) => found(record, 'exact'));
    routes.push({
      route: 'exact',
      registers: names,
      hits: exact.length,
      dropped: 0,
      skipped: null,
    });
  }
  if (request.text !== null) {
    const semantic = await semanticRoute(ctx, registers, base, request.text);
    semantic.hits.forEach(({ record, score }) => found(record, 'semantic', score));
    routes.push(semantic.route);
  }
  if (request.key === null && request.text === null) {
    const temporal = await ctx.ports.records.find({ ...base, limit });
    temporal.forEach((record) => found(record, 'temporal'));
    routes.push({
      route: 'temporal',
      registers: names,
      hits: temporal.length,
      dropped: 0,
      skipped: null,
    });
  }

  const ranked = rank([...candidates.values()] satisfies Candidate[], ctx.space.policy, now);
  const { items, omitted } = fill(ranked, ctx.space.policy.recall);
  return {
    items: items.map((item) => ({
      record: recordDto(item.record),
      score: item.score,
      factors: item.factors,
      routes: [...item.routes].sort(byText),
    })),
    routes,
    omitted,
  };
}
