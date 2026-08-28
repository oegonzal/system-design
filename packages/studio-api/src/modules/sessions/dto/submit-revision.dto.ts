import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { REVISION_NOTES_MAX_LENGTH, type SubmitRevisionRequest } from '@sysdesign/contracts';

import { CanvasGraphDto } from './canvas-graph.dto';

export class SubmitRevisionRequestDto implements SubmitRevisionRequest {
  /** @IsDefined because @ValidateNested alone lets an absent graph through. */
  @IsDefined()
  @ValidateNested()
  @Type(() => CanvasGraphDto)
  graph!: CanvasGraphDto;

  @IsOptional()
  @IsString()
  @MaxLength(REVISION_NOTES_MAX_LENGTH)
  notes?: string;
}
