import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BINDING_MAX_NODES,
  BINDING_NOTE_MAX_LENGTH,
  BRIEF_MAX_FLOWS,
  BRIEF_MAX_NFR_BINDINGS,
  CANVAS_ID_MAX_LENGTH,
  DESIGN_BRIEF_VERSION,
  FLOW_MAX_STEPS,
  MECHANISM_CLAIMS,
  type DesignBrief,
  type FlowBinding,
  type MechanismClaim,
  type NfrBinding,
} from '@sysdesign/contracts';

/**
 * Wire validation of a submitted design brief. Same split as
 * `canvas-graph.dto.ts`: shape errors (unknown mechanism, oversize arrays) are
 * a 400 here; referential errors (a node id the graph never declares, a flow
 * path that does not connect) belong to the shared brief validator in
 * `@sysdesign/contracts` and answer 422.
 *
 * The boundary that must not blur: an IMPOSSIBLE binding is rejected, an
 * UNSUPPORTED one is graded. If the API refused claims the diagram fails to
 * back up, it would silently do the teaching the evaluation exists to do.
 */
export class NfrBindingDto implements NfrBinding {
  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  nfrId!: string;

  @IsArray()
  @ArrayMaxSize(BINDING_MAX_NODES)
  @IsString({ each: true })
  @MaxLength(CANVAS_ID_MAX_LENGTH, { each: true })
  nodeIds!: string[];

  @IsIn([...MECHANISM_CLAIMS])
  mechanism!: MechanismClaim;

  @IsOptional()
  @IsString()
  @MaxLength(BINDING_NOTE_MAX_LENGTH)
  note?: string;
}

export class FlowBindingDto implements FlowBinding {
  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  id!: string;

  /** An ordinal into the prompt's functional requirements, never its text. */
  @IsInt()
  @Min(0)
  requirementIndex!: number;

  @IsArray()
  @ArrayMaxSize(FLOW_MAX_STEPS)
  @IsString({ each: true })
  @MaxLength(CANVAS_ID_MAX_LENGTH, { each: true })
  path!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(BINDING_NOTE_MAX_LENGTH)
  note?: string;
}

export class DesignBriefDto implements DesignBrief {
  @Equals(DESIGN_BRIEF_VERSION)
  version!: 1;

  @IsArray()
  @ArrayMaxSize(BRIEF_MAX_NFR_BINDINGS)
  @ValidateNested({ each: true })
  @Type(() => NfrBindingDto)
  nfrBindings!: NfrBindingDto[];

  @IsArray()
  @ArrayMaxSize(BRIEF_MAX_FLOWS)
  @ValidateNested({ each: true })
  @Type(() => FlowBindingDto)
  flows!: FlowBindingDto[];
}
