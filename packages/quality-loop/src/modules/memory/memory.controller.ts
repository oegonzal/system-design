import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { ReindexMemoryRunResponse, RetrievalReportResponse } from '@sysdesign/contracts';

import { ZodValidationPipe } from '@sysdesign/nest-kit';
import { reportRequestSchema } from './memory-request';
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
    @Body(new ZodValidationPipe(reportRequestSchema)) body: { goal: string },
  ): Promise<RetrievalReportResponse> {
    return { data: await this.memory.retrievalReport(body.goal) };
  }
}
