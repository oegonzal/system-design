import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { EventEnvelope, PublishEventRequest } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { Bus } from '../bus';
import { answered } from './refusals';
import { publishEventSchema } from './requests';

/** POST /events: a client publishes one event; a topic the service alone publishes is refused. */
@Controller('events')
export class EventsController {
  constructor(private readonly bus: Bus) {}

  @Post()
  @HttpCode(201)
  async publish(
    @Body(new ZodValidationPipe(publishEventSchema)) body: PublishEventRequest,
  ): Promise<{ data: EventEnvelope }> {
    return { data: await answered(() => this.bus.publish(body, 'anyone')) };
  }
}
