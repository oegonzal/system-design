import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CANVAS_ID_MAX_LENGTH,
  NARRATION_MAX_COMPONENT_RATIONALES,
  NARRATION_MAX_FLOW_NARRATIONS,
  NARRATION_OVERVIEW_MAX_LENGTH,
  NARRATION_PROSE_MAX_LENGTH,
  NARRATION_VERSION,
  type ComponentRationale,
  type DesignNarrative,
  type FlowNarration,
} from '@sysdesign/contracts';

/**
 * Wire validation of a submitted design narrative. Same split the brief keeps:
 * shape errors (oversize prose, a version mismatch, a negative ordinal) are a
 * 400 here; referential errors (a rationale for a node the graph never
 * declared, a flow ordinal past the prompt's requirements) belong to
 * the shared `validateNarration` in `@sysdesign/contracts` and answer 422.
 *
 * Prose is length-capped but never inspected for content — the grade reads a
 * typed projection of these slots, never the strings, so nothing here decides
 * whether a rationale is "good"; that is the evaluation's job.
 */
export class ComponentRationaleDto implements ComponentRationale {
  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  nodeId!: string;

  @IsString()
  @MaxLength(NARRATION_PROSE_MAX_LENGTH)
  prose!: string;
}

export class FlowNarrationDto implements FlowNarration {
  /** An ordinal into the prompt's functional requirements, never its text. */
  @IsInt()
  @Min(0)
  requirementIndex!: number;

  @IsString()
  @MaxLength(NARRATION_PROSE_MAX_LENGTH)
  prose!: string;
}

export class DesignNarrativeDto implements DesignNarrative {
  @Equals(NARRATION_VERSION)
  version!: 1;

  @IsOptional()
  @IsString()
  @MaxLength(NARRATION_OVERVIEW_MAX_LENGTH)
  overview?: string;

  @IsArray()
  @ArrayMaxSize(NARRATION_MAX_COMPONENT_RATIONALES)
  @ValidateNested({ each: true })
  @Type(() => ComponentRationaleDto)
  componentRationales!: ComponentRationaleDto[];

  @IsArray()
  @ArrayMaxSize(NARRATION_MAX_FLOW_NARRATIONS)
  @ValidateNested({ each: true })
  @Type(() => FlowNarrationDto)
  flowNarrations!: FlowNarrationDto[];
}
