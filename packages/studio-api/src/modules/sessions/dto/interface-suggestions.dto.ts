import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { NARRATIVE_MAX_LENGTH, type InterfaceSuggestionsRequest } from '@sysdesign/contracts';

import { CanvasGraphDto } from './canvas-graph.dto';

/**
 * The draft plus the one component to advise on. The canvas comes in the body
 * for the same reason the brief suggester's does: the design being asked about
 * is the unsubmitted one on screen.
 */
export class InterfaceSuggestionsRequestDto implements InterfaceSuggestionsRequest {
  @IsDefined()
  @ValidateNested()
  @Type(() => CanvasGraphDto)
  graph!: CanvasGraphDto;

  /** Must name a node in `graph` — checked referentially in the service, not here. */
  @IsString()
  @MaxLength(64)
  nodeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NARRATIVE_MAX_LENGTH)
  narrative?: string;
}
