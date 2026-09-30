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
  RetrievalHitDto,
  RetrievalProbeDto,
  RetrievalReportDto,
} from '@sysdesign/contracts';
import { MEMORY_ORCHESTRATOR_ID } from '@sysdesign/contracts';

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
import { MEMORY_PORTS } from './tokens';

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

  /** A registered pipeline's own accept bar; unreachable when it is not registered. */
  private acceptAt(pipeline: string): number {
    return this.runs.summary(pipeline).policy.thresholds.acceptAt;
  }
}
