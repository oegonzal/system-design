import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';

import type {
  AckRequest,
  EventEnvelope,
  SubscribeRequest,
  Subscription,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { Bus } from '../bus';
import { BUS_SETTINGS, type BusSettings } from '../settings';
import { answered } from './refusals';
import { ackSchema, pullQuerySchema, subscribeSchema, type PullQuery } from './requests';

/**
 * Subscriptions over HTTP: create or replace one by name, pull its events —
 * waiting for them when there are none — acknowledge what was handled, and
 * delete it. A pull whose client leaves stops waiting at once.
 */
@Controller('subscriptions')
export class SubscriptionsController {
  private readonly pullQuery: ZodValidationPipe<PullQuery>;

  constructor(
    private readonly bus: Bus,
    @Inject(BUS_SETTINGS) settings: BusSettings,
  ) {
    this.pullQuery = new ZodValidationPipe(pullQuerySchema(settings));
  }

  @Put(':name')
  async subscribe(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeRequest,
  ): Promise<{ data: Subscription }> {
    return { data: await answered(() => this.bus.subscribe(name, body)) };
  }

  @Get(':name/events')
  async pull(
    @Param('name') name: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<{ data: EventEnvelope[] }> {
    const { waitMs, max } = this.pullQuery.transform(query);
    const leaving = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) leaving.abort();
    });
    return { data: await answered(() => this.bus.pull(name, { waitMs, max }, leaving.signal)) };
  }

  @Post(':name/ack')
  @HttpCode(200)
  async ack(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(ackSchema)) body: AckRequest,
  ): Promise<{ data: Subscription }> {
    return { data: await answered(() => this.bus.ack(name, body.seq)) };
  }

  @Delete(':name')
  @HttpCode(204)
  async unsubscribe(@Param('name') name: string): Promise<void> {
    if (!(await this.bus.unsubscribe(name))) {
      throw new NotFoundException({
        message: `no such subscription: ${name}`,
        missing: 'subscription',
      });
    }
  }
}
