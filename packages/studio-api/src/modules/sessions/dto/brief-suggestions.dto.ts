import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { NARRATIVE_MAX_LENGTH, type BriefSuggestionsRequest } from '@sysdesign/contracts';

import { CanvasGraphDto } from './canvas-graph.dto';

/**
 * The draft to reason about, sent in the body rather than read from the latest
 * revision — the author is asking about a design they have not submitted, which
 * is the whole reason they are asking.
 */
export class BriefSuggestionsRequestDto implements BriefSuggestionsRequest {
  // `@IsDefined` because `@ValidateNested` alone passes a missing object.
  @IsDefined()
  @ValidateNested()
  @Type(() => CanvasGraphDto)
  graph!: CanvasGraphDto;

  @IsOptional()
  @IsString()
  @MaxLength(NARRATIVE_MAX_LENGTH)
  narrative?: string;
}
