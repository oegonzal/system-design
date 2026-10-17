import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '@sysdesign/nest-kit';
import { z } from 'zod';

import type { MemoryDesignCycleDto } from './cycle';
import { DesignsService } from './designs.service';

/** The one thing a caller starts a cycle with: the memory brief to design a strategy for. */
export const startDesignSchema = z.strictObject({ goal: z.string().min(1) });
export type StartDesignRequest = z.infer<typeof startDesignSchema>;

/** Start a design cycle from a memory brief, and read one back. */
@Controller('designs')
export class DesignsController {
  private readonly logger = new Logger(DesignsController.name);

  constructor(private readonly designs: DesignsService) {}

  /** 202: the cycle is recorded and set going off the request path; poll `GET /designs/:id`. */
  @Post()
  @HttpCode(202)
  async start(
    @Body(new ZodValidationPipe(startDesignSchema)) body: StartDesignRequest,
  ): Promise<{ data: MemoryDesignCycleDto }> {
    const cycle = await this.designs.start(body.goal);
    // The goal is not persisted on the row, so execute is handed it here.
    // execute records its own failures on the row and never throws; the catch is belt-and-braces.
    void this.designs
      .execute(cycle.id, body.goal)
      .catch((error: unknown) => this.logger.error(`cycle ${cycle.id}: ${String(error)}`));
    return { data: cycle };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<{ data: MemoryDesignCycleDto }> {
    const cycle = await this.designs.get(id);
    if (cycle === null) throw new NotFoundException({ message: `no design cycle ${id}` });
    return { data: cycle };
  }
}
