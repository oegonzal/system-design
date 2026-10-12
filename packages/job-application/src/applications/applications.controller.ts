import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  ApplicationDto,
  CompanyDto,
  CorrectApplicationRequest,
  CreateApplicationRequest,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { ApplicationsService } from './applications.service';
import {
  applicationsQuerySchema,
  companiesQuerySchema,
  correctApplicationSchema,
  createApplicationSchema,
  type ApplicationsQueryInput,
} from './requests';

/** The record's own routes; every body and query checked at the door, every answer in the `{data}` envelope. */
@Controller()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get('applications')
  async list(
    @Query(new ZodValidationPipe(applicationsQuerySchema)) query: ApplicationsQueryInput,
  ): Promise<{ data: ApplicationDto[] }> {
    return { data: await this.applications.list(query) };
  }

  @Get('companies')
  async companies(
    @Query(new ZodValidationPipe(companiesQuerySchema)) query: { subject: string },
  ): Promise<{ data: CompanyDto[] }> {
    return { data: await this.applications.companies(query.subject) };
  }

  @Post('applications')
  @HttpCode(201)
  async enter(
    @Body(new ZodValidationPipe(createApplicationSchema)) body: CreateApplicationRequest,
  ): Promise<{ data: ApplicationDto }> {
    return { data: await this.applications.enter(body) };
  }

  @Patch('applications/:id')
  async correct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(correctApplicationSchema)) body: CorrectApplicationRequest,
  ): Promise<{ data: ApplicationDto }> {
    const corrected = await this.applications.correct(id, body.status);
    if (corrected === null) throw new NotFoundException({ message: `no application ${id}` });
    return { data: corrected };
  }
}
