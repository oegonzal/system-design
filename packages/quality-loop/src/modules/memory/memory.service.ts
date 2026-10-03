/**
 * The two memory tools that need the ports without running the orchestrator:
 * a re-index of a finished memory run's lessons, and the retrieval report
 * that shows what a recall would find for a goal. Memory runs themselves are
 * `POST /orchestrations/memory`.
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  OrchestrationStepDto,
  QualityRunDto,
  QualityRunSummaryDto,
  RecallEffectivenessDto,
  RetrievalHitDto,
  RetrievalProbeDto,
  RetrievalReportDto,
  StandingGapsDto,
} from '@sysdesign/contracts';
import { MEMORY_ORCHESTRATOR_ID } from '@sysdesign/contracts';

import { MEMORY_RECALL_ID } from '../../pipelines/memory-recall/input';
import { outputsOf } from '../../core/outputs';
import { digestedChildren } from '../../orchestrators/memory/definition';
import { memoriesToStore } from '../../orchestrators/memory/digest/read-digest';
import type { MemoryHit, MemoryPorts, MemoryProbe } from '../../orchestrators/memory/ports';
import { fuse } from '../../orchestrators/memory/recall/fusion';
import { bareGoal } from '../../orchestrators/memory/recall/inject';
import { probeOf, probesOf, probeTexts, queryText } from '../../orchestrators/memory/recall/query';
import { indexMemories } from '../../orchestrators/memory/store/index-memories';
import { EXPERIENCE_DIGEST_ID } from '../../pipelines/experience-digest/input';
import { alias, MAX_CANDIDATES, probeAlias } from '../../pipelines/memory-recall/input';
import { isOrchestrationRunId } from '../orchestration/orchestration-request';
import type { OrchestrationRunRepository } from '../orchestration/ports';
import { ORCHESTRATION_RUN_REPOSITORY } from '../orchestration/tokens';
import { RunsService } from '../runs/runs.service';
import { recallEffectiveness, type RecallingRun } from './reports/effectiveness';
import { goalHashOf, standingGaps, type AttributedRecall } from './reports/gaps';
import { MEMORY_PORTS } from './tokens';

/** How far back a report will read, and in what pages: a bound by declaration, not by accident. */
const MAX_REPORT_RUNS = 500;
const REPORT_PAGE = 100;

/** The first text searched is the prompt itself; the rest are the derived probes, aliased in order. */
const probeLabel = (position: number): string =>
  position === 0 ? 'prompt' : probeAlias(position - 1);

const asHit = (hit: MemoryHit): RetrievalHitDto => ({
  runId: hit.source.runId,
  ref: hit.source.ref,
  score: hit.score,
  text: hit.text,
});

/** One searched text with its own rankings: every vector it was searched under, and what each found. */
const probeReport = (
  text: string,
  position: number,
  probes: readonly MemoryProbe[],
  ranked: readonly MemoryHit[][],
): RetrievalProbeDto => ({
  alias: probeLabel(position),
  text,
  found: probes
    .map((probe, index) => ({ probe, index }))
    .filter(({ index }) => probeOf(index) === position)
    .map(({ probe, index }) => ({
      using: probe.using,
      hits: (ranked[index] ?? []).map(asHit),
    })),
});

@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly runs: RunsService,
    @Inject(MEMORY_PORTS) private readonly ports: MemoryPorts,
    @Inject(ORCHESTRATION_RUN_REPOSITORY) private readonly records: OrchestrationRunRepository,
  ) {}

  /** Boot only: say what the store can do. */
  async onModuleInit(): Promise<void> {
    const availability = await this.ports.store.verify();
    if (availability.ready) {
      this.logger.log(
        `memory store ready: ${availability.collection} (${availability.chunks} chunks)`,
      );
    } else {
      this.logger.warn(`memory store not ready: ${availability.reason ?? 'unknown'}`);
    }
  }

  /**
   * Re-index a memory run's lessons against the current index generation:
   * the digest it already produced, embedded again. Deliberately not a
   * re-digest — that asks a model to derive the lessons afresh, and
   * `replaceRunChunks` deletes a run's chunks before it writes, so a replay
   * that answers differently destroys what it was meant to migrate.
   */
  async reindex(id: string): Promise<OrchestrationStepDto> {
    const record = isOrchestrationRunId(id) ? await this.records.find(id) : null;
    if (record === null || record.orchestrator !== MEMORY_ORCHESTRATOR_ID) {
      throw new NotFoundException(`memory run ${id} not found`);
    }
    const children = digestedChildren(record);
    if (children === null) {
      throw new BadRequestException(`memory run ${id} digested no run to re-index`);
    }
    const [digestRun, source] = await Promise.all([
      this.runs.get(children.digestRunId),
      this.runs.get(children.targetRunId),
    ]);
    if (digestRun?.trace == null || source === null) {
      throw new NotFoundException(`memory run ${id} refers to a run that is no longer stored`);
    }
    const model = this.ports.embeddings.model;
    if (model === null) throw new BadRequestException('embeddings are disabled');

    const { memories } = memoriesToStore(
      outputsOf(digestRun.trace),
      this.acceptAt(EXPERIENCE_DIGEST_ID),
    );
    const at = new Date().toISOString();
    const outcome = await indexMemories(
      this.ports,
      source,
      { digestRunId: digestRun.runId, memories },
      model,
    );
    this.logger.log(`memory run ${id} re-indexed: ${outcome.status}`);
    return {
      status: outcome.status,
      reason: outcome.reason ?? null,
      note: outcome.note ?? null,
      counts: outcome.counts ?? {},
      runIds: [digestRun.runId],
      report: null,
      startedAt: at,
      finishedAt: new Date().toISOString(),
    };
  }

  /**
   * What a recall would retrieve for a goal, without running a pipeline: the
   * probes derived, each probe's own ranking, and the fused list. This is the
   * measurement tool — a score floor is only defensible against it.
   */
  async retrievalReport(goal: string): Promise<RetrievalReportDto> {
    const { embeddings, store, probes: deriver } = this.ports;
    const availability = await store.verify();
    const bare = bareGoal(goal);
    const texts = probeTexts(bare, await deriver.derive(queryText(bare)));
    const embedded = await embeddings.embed(texts);
    if (embedded === null) throw new BadRequestException('embeddings are unavailable');
    const probes = probesOf(embedded.vectors, MAX_CANDIDATES);
    const ranked = await store.searchMany(probes);
    return {
      store: availability,
      probes: texts.map((text, position) => probeReport(text, position, probes, ranked)),
      candidates: fuse(ranked, MAX_CANDIDATES).map((hit, position) => ({
        alias: alias(position),
        ...asHit(hit),
        matched: hit.probes.map(probeLabel),
      })),
    };
  }

  /**
   * Whether recalled lessons went with runs whose defects then resolved. A read
   * over records already written: the runs that recalled, each with the recall
   * run it opened, joined to what the engine said changed in the next iteration.
   * Reports nothing a record does not hold, and writes nothing at all.
   */
  async effectiveness(query: {
    pipeline?: string;
    limit: number;
  }): Promise<RecallEffectivenessDto> {
    const { rows, scanned } = await this.scan(
      { pipeline: query.pipeline, status: 'complete' },
      (summary) => summary.recall !== null && summary.recall.status === 'recalled',
      query.limit,
    );
    const entries: RecallingRun[] = [];
    for (const summary of rows) {
      const run = await this.runs.get(summary.runId);
      if (run === null || run.recall === null) continue;
      // The recall run is what carries the candidates' own points, read out of
      // the query it was asked. A run that recorded no recall run — it never
      // opened one — contributes its outcomes and no lesson rows.
      const recallRunId = run.recall.recallRunId;
      const recall = recallRunId === null ? null : await this.runs.get(recallRunId);
      entries.push({ run, recall });
    }
    return recallEffectiveness(entries, scanned);
  }

  /**
   * What recalls could not serve, by brief. A recall is attributed to the brief
   * it served through the run that opened it; one whose parent is no longer
   * stored is counted rather than guessed at.
   */
  async gaps(query: {
    runId?: string;
    goalHash?: string;
    limit: number;
  }): Promise<StandingGapsDto> {
    const { rows, scanned } = await this.scan(
      { pipeline: MEMORY_RECALL_ID, status: 'complete' },
      () => true,
      query.limit,
    );
    const attributed: AttributedRecall[] = [];
    for (const summary of rows) {
      const recall = await this.runs.get(summary.runId);
      if (recall === null) continue;
      attributed.push({ recall, goal: await this.briefOf(recall) });
    }
    const report = standingGaps(attributed, scanned);
    const wanted = await this.wantedHash(query);
    return wanted === null
      ? report
      : { ...report, groups: report.groups.filter((group) => group.goalHash === wanted) };
  }

  /** The brief a recall served: the goal of the run that opened it, taken bare. */
  private async briefOf(recall: QualityRunDto): Promise<string | null> {
    if (recall.parentRunId === null) return null;
    const parent = await this.runs.get(recall.parentRunId);
    return parent?.request.goal ?? null;
  }

  /** The one group a query asked for, by brief hash or by the run whose brief it is. */
  private async wantedHash(query: { runId?: string; goalHash?: string }): Promise<string | null> {
    if (query.goalHash !== undefined) return query.goalHash;
    if (query.runId === undefined) return null;
    const run = await this.runs.get(query.runId);
    if (run === null) throw new NotFoundException(`run ${query.runId} not found`);
    // A recall run names the brief through its parent; any other run is its own.
    const goal = run.pipeline === MEMORY_RECALL_ID ? await this.briefOf(run) : run.request.goal;
    return goal === null ? null : goalHashOf(goal);
  }

  /**
   * Rows a report reads, newest first, paged until it has `limit` of them or the
   * scan bound is reached — so a report over a long history is bounded by
   * declaration rather than by how much a page happened to hold.
   */
  private async scan(
    query: { pipeline?: string; status: 'complete' },
    keep: (summary: QualityRunSummaryDto) => boolean,
    limit: number,
  ): Promise<{ rows: QualityRunSummaryDto[]; scanned: number }> {
    const rows: QualityRunSummaryDto[] = [];
    let scanned = 0;
    for (let offset = 0; offset < MAX_REPORT_RUNS; offset += REPORT_PAGE) {
      const [page] = await this.runs.listRuns({ ...query, limit: REPORT_PAGE, offset });
      if (page.length === 0) break;
      scanned += page.length;
      for (const summary of page) {
        if (keep(summary)) rows.push(summary);
        if (rows.length === limit) return { rows, scanned };
      }
      if (page.length < REPORT_PAGE) break;
    }
    return { rows, scanned };
  }

  /** A registered pipeline's own accept bar; unreachable when it is not registered. */
  private acceptAt(pipeline: string): number {
    return this.runs.summary(pipeline).policy.thresholds.acceptAt;
  }
}
