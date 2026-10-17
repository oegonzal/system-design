import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  toolInvocationSchema,
  type ToolDeclaration,
  type ToolInvocation,
  type ToolOutcome,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { isArgumentsRefusal, ToolCatalog } from '../catalog';

type Envelope<T> = { data: T };

/** The program's tools as declared, and each one run directly — what a peer program mounts. */
@Controller('tools')
export class ToolsController {
  constructor(private readonly catalog: ToolCatalog) {}

  @Get()
  list(): Envelope<ToolDeclaration[]> {
    return { data: this.catalog.declarations() };
  }

  /** 200 with the outcome, however the tool fared; 400 with the issues for arguments the tool refuses; 404 for a tool it does not have. */
  @Post(':name')
  @HttpCode(200)
  async invoke(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(toolInvocationSchema)) body: ToolInvocation,
  ): Promise<Envelope<ToolOutcome>> {
    if (this.catalog.declaration(name) === null) {
      throw new NotFoundException({ message: `no tool ${name}` });
    }
    const outcome = await this.catalog.execute(name, body.arguments);
    if (outcome.outcome === 'refused' && isArgumentsRefusal(outcome.data)) {
      throw new BadRequestException({ message: 'validation failed', issues: outcome.data.issues });
    }
    return { data: outcome };
  }
}
