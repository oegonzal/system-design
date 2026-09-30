import { Module } from '@nestjs/common';

import { PIPELINES } from '../../pipelines';
import { PIPELINES_TOKEN } from './tokens';

/** The registry alone — every pipeline as data, importable by anything that only reads definitions. */
@Module({
  providers: [{ provide: PIPELINES_TOKEN, useValue: PIPELINES }],
  exports: [PIPELINES_TOKEN],
})
export class PipelinesModule {}
