import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  FormRetrievalReportResponse,
  FormRetrievalRequest,
  RecallEffectivenessResponse,
  ReindexMemoryRunResponse,
  RetractMemoryPointResponse,
  RetractMemoryRunResponse,
  RetrievalReportResponse,
  StandingGapsResponse,
} from '@sysdesign/contracts';

import { formRetrievalRequestSchema } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { goalRequestSchema } from '../http/goal-request';
import { effectivenessQuerySchema, gapsQuerySchema } from './memory-request';
import { MemoryService } from './memory.service';

/** The memory tools that need no orchestration; a memory run is `POST /orchestrations/memory`. */
@Controller('memory')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  /**
   * Re-embed a memory run's stored lessons under the current index generation.
   * Synchronous: no pipeline runs, only the embeddings and the store.
   */
  @Post(':id/reindex')
  @HttpCode(200)
  async reindex(@Param('id') id: string): Promise<ReindexMemoryRunResponse> {
    return { data: await this.memory.reindex(id) };
  }

  /**
   * Retract every point a digest run stored, by the run's id — what a document
   * taught or ingested again calls before its new digest lands. Idempotent: a
   * run the store never held removes nothing.
   */
  @Delete(':id')
  @HttpCode(200)
  async retract(@Param('id') id: string): Promise<RetractMemoryRunResponse> {
    return { data: await this.memory.retract(id) };
  }

  /**
   * Retract one memory a digest run stored, by the run's id and the memory's
   * ref — a fact since corrected, when the rest of its run still holds. Answers
   * the text, kind and scope that went; a point the store never held removes
   * nothing and answers `removed: null`. `:ref` is required after the literal
   * `points`, so an address whose ref is empty or missing —
   * `/memory/<run>/points/` or `/memory/<run>/points` — matches neither route
   * here and answers 404. Without the segment it would not: Express leaves
   * `strict routing` off, which reads `/memory/<run>/` as `/memory/<run>`, the
   * run's own retraction above.
   */
  @Delete(':id/points/:ref')
  @HttpCode(200)
  async retractPoint(
    @Param('id') id: string,
    @Param('ref') ref: string,
  ): Promise<RetractMemoryPointResponse> {
    return { data: await this.memory.retractPoint(id, ref) };
  }

  /**
   * What a form page's recall would retrieve for these fields, and why — the
   * fields' own words as probes, the budget each kind of control takes, each
   * named vector's ranking, the fused list per field and the dealt evidence.
   * Runs no pipeline; the measurement seam of the form path.
   */
  @Post('form-retrieval-report')
  @HttpCode(200)
  async formRetrievalReport(
    @Body(new ZodValidationPipe(formRetrievalRequestSchema)) body: FormRetrievalRequest,
  ): Promise<FormRetrievalReportResponse> {
    return { data: await this.memory.formRetrievalReport(body.fields) };
  }

  /**
   * What a recall would retrieve for this goal, and why. Runs no pipeline —
   * probes, embeddings and the store only — so it is cheap enough to sweep a
   * corpus with while calibrating.
   */
  @Post('retrieval-report')
  @HttpCode(200)
  async report(
    @Body(new ZodValidationPipe(goalRequestSchema)) body: { goal: string },
  ): Promise<RetrievalReportResponse> {
    return { data: await this.memory.retrievalReport(body.goal) };
  }

  /**
   * Whether recalled lessons went with runs whose defects then resolved. A read
   * over records already written — no pipeline, no model, no store write.
   */
  @Get('effectiveness')
  async effectiveness(
    @Query(new ZodValidationPipe(effectivenessQuerySchema))
    query: {
      pipeline?: string;
      limit: number;
    },
  ): Promise<RecallEffectivenessResponse> {
    return { data: await this.memory.effectiveness(query) };
  }

  /** What recalls could not serve, by brief: what the store has yet to learn. */
  @Get('gaps')
  async gaps(
    @Query(new ZodValidationPipe(gapsQuerySchema))
    query: {
      runId?: string;
      goalHash?: string;
      limit: number;
    },
  ): Promise<StandingGapsResponse> {
    return { data: await this.memory.gaps(query) };
  }
}
