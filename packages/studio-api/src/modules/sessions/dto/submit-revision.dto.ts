import { Type } from 'class-transformer';
import { IsDefined, IsOptional, ValidateNested } from 'class-validator';
import type { SubmitRevisionRequest } from '@sysdesign/contracts';

import { CanvasGraphDto } from './canvas-graph.dto';
import { DesignBriefDto } from './design-brief.dto';
import { DesignNarrativeDto } from './design-narrative.dto';

export class SubmitRevisionRequestDto implements SubmitRevisionRequest {
  /** @IsDefined because @ValidateNested alone lets an absent graph through. */
  @IsDefined()
  @ValidateNested()
  @Type(() => CanvasGraphDto)
  graph!: CanvasGraphDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DesignNarrativeDto)
  narrative?: DesignNarrativeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DesignBriefDto)
  brief?: DesignBriefDto;
}
