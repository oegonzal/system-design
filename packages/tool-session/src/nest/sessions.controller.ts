import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  startToolSessionRequestSchema,
  type StartToolSessionRequest,
  type ToolSessionRecord,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { PeerUnreachable } from '../catalog';
import { SessionRegistry } from '../session';

type Envelope<T> = { data: T };

/** Start a session over a mission, read sessions back, and stop one. */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly registry: SessionRegistry) {}

  /** 202: the session is recorded and set going off the request path; poll `GET /sessions/:id`. 503 names a peer that cannot be reached. */
  @Post()
  @HttpCode(202)
  async start(
    @Body(new ZodValidationPipe(startToolSessionRequestSchema)) body: StartToolSessionRequest,
  ): Promise<Envelope<ToolSessionRecord>> {
    try {
      return { data: await this.registry.start(body) };
    } catch (error) {
      if (error instanceof PeerUnreachable) {
        throw new ServiceUnavailableException({ message: error.message });
      }
      throw error;
    }
  }

  @Get()
  list(): Envelope<ToolSessionRecord[]> {
    return { data: this.registry.list() };
  }

  @Get(':id')
  get(@Param('id') id: string): Envelope<ToolSessionRecord> {
    const record = this.registry.get(id);
    if (record === null) throw new NotFoundException({ message: `no session ${id}` });
    return { data: record };
  }

  /** 202: the session is told to stop after the step in flight; its record says when it did. */
  @Post(':id/stop')
  @HttpCode(202)
  stop(@Param('id') id: string): Envelope<ToolSessionRecord> {
    if (!this.registry.stop(id)) throw new NotFoundException({ message: `no session ${id}` });
    return { data: this.registry.get(id) as ToolSessionRecord };
  }
}
