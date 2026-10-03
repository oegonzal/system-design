import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  RecallEffectivenessResponse,
  ReindexMemoryRunResponse,
  RetrievalReportResponse,
  StandingGapsResponse,
} from '@sysdesign/contracts';

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
