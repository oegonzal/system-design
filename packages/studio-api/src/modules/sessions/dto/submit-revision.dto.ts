import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { NARRATIVE_MAX_LENGTH, type SubmitRevisionRequest } from '@sysdesign/contracts';

import { CanvasGraphDto } from './canvas-graph.dto';
import { DesignBriefDto } from './design-brief.dto';

export class SubmitRevisionRequestDto implements SubmitRevisionRequest {
  /** @IsDefined because @ValidateNested alone lets an absent graph through. */
  @IsDefined()
  @ValidateNested()
  @Type(() => CanvasGraphDto)
  graph!: CanvasGraphDto;

  @IsOptional()
  @IsString()
  @MaxLength(NARRATIVE_MAX_LENGTH)
  narrative?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DesignBriefDto)
  brief?: DesignBriefDto;
}
