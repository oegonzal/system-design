import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  FUNCTIONAL_CAPABILITIES,
  NFR_KINDS,
  PROMPT_DIFFICULTIES,
  PROMPT_TITLE_MAX_LENGTH,
  type AuthorPromptRequest,
  type FunctionalCapability,
  type NfrItem,
  type NfrKind,
  type NfrTargetSpec,
  type PromptDifficulty,
  type ScaleTargets,
} from '@sysdesign/contracts';

import { WorkflowSpecDto } from './workflow-spec.dto';

/** Generous prose caps: an assessment's sentences, not a bank's. */
const SCENARIO_MAX_LENGTH = 4000;
const REQUIREMENT_MAX_LENGTH = 300;
const MAX_REQUIREMENTS = 12;
const NFR_ID_MAX_LENGTH = 40;

export class NfrTargetSpecDto implements NfrTargetSpec {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  metric!: string;

  @IsIn(['<=', '>=', '='])
  op!: '<=' | '>=' | '=';

  @IsNumber()
  value!: number;

  @IsString()
  @MaxLength(20)
  unit!: string;
}

export class NfrItemDto implements NfrItem {
  @IsString()
  @MinLength(1)
  @MaxLength(NFR_ID_MAX_LENGTH)
  id!: string;

  @IsIn(NFR_KINDS)
  kind!: NfrKind;

  @IsString()
  @MinLength(1)
  @MaxLength(REQUIREMENT_MAX_LENGTH)
  statement!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  target?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NfrTargetSpecDto)
  targetSpec?: NfrTargetSpecDto;
}

export class ScaleTargetsDto implements ScaleTargets {
  @IsInt()
  @Min(1)
  concurrentUsers!: number;

  @IsInt()
  @Min(1)
  requestsPerSecond!: number;

  /** "98:2" — the same shape the generator writes; the engine parses it. */
  @IsString()
  @MaxLength(12)
  readWriteRatio!: string;

  @IsInt()
  @Min(1)
  p99LatencyMs!: number;

  @IsString()
  @MaxLength(12)
  availabilityPct!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dataRetention?: string;
}

/**
 * An assessment's requirements, verbatim. Shape here; references (an ingest
 * naming an NFR this prompt does not carry, a spec that does not close) are
 * the service's one-422 pass — the same split the revision submit path draws.
 */
export class AuthorPromptRequestDto implements AuthorPromptRequest {
  @IsUUID()
  experienceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PROMPT_TITLE_MAX_LENGTH)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SCENARIO_MAX_LENGTH)
  scenario!: string;

  @IsIn(PROMPT_DIFFICULTIES)
  difficulty!: PromptDifficulty;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REQUIREMENTS)
  @IsString({ each: true })
  @MaxLength(REQUIREMENT_MAX_LENGTH, { each: true })
  functionalRequirements!: string[];

  @IsArray()
  @ArrayMaxSize(FUNCTIONAL_CAPABILITIES.length)
  @IsIn(FUNCTIONAL_CAPABILITIES, { each: true })
  functionalCapabilities!: FunctionalCapability[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REQUIREMENTS)
  @ValidateNested({ each: true })
  @Type(() => NfrItemDto)
  nonFunctionalRequirements!: NfrItemDto[];

  @IsDefined()
  @ValidateNested()
  @Type(() => ScaleTargetsDto)
  scaleTargets!: ScaleTargetsDto;

  /** null = no business layer; the product dimension then stays out of this prompt's rubric. */
  @ValidateIf((_, value) => value !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => WorkflowSpecDto)
  workflowSpec!: WorkflowSpecDto | null;
}
