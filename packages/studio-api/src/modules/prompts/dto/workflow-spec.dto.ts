import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  PROMPT_DIFFICULTIES,
  WORKFLOW_ID_MAX_LENGTH,
  WORKFLOW_MAX_AGGREGATIONS,
  WORKFLOW_MAX_ENTITIES,
  WORKFLOW_MAX_EVENTS,
  WORKFLOW_MAX_INGESTS,
  WORKFLOW_MAX_OPERATIONS,
  WORKFLOW_MAX_TRANSITIONS,
  type PromptDifficulty,
  type WorkflowAggregation,
  type WorkflowEntity,
  type WorkflowEvent,
  type WorkflowIngest,
  type WorkflowOperation,
  type WorkflowSpec,
  type WorkflowTransition,
} from '@sysdesign/contracts';

/**
 * The SHAPE of an authored workflow spec, field by field. Closure — every
 * `via`/`emits`/`consumes`/source id resolving to a declared item — is the
 * validators' business (`validateWorkflowSpec`, one 422 listing every
 * problem), exactly the shape-vs-reference split the revision submit path
 * draws. Statements and names are display-only and only length-capped.
 */
const STATEMENT_MAX_LENGTH = 300;

export class WorkflowTransitionDto implements WorkflowTransition {
  /** null means this transition creates the entity. */
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  from!: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  via!: string;
}

export class WorkflowEntityDto implements WorkflowEntity {
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  id!: string;

  @IsString()
  @MaxLength(STATEMENT_MAX_LENGTH)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WORKFLOW_MAX_TRANSITIONS)
  @IsString({ each: true })
  states!: string[];

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_TRANSITIONS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowTransitionDto)
  transitions!: WorkflowTransitionDto[];
}

export class WorkflowEventDto implements WorkflowEvent {
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  id!: string;

  @IsString()
  @MaxLength(STATEMENT_MAX_LENGTH)
  statement!: string;

  @IsOptional()
  @IsIn(PROMPT_DIFFICULTIES)
  minDifficulty?: PromptDifficulty;
}

export class WorkflowOperationDto implements WorkflowOperation {
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  id!: string;

  @IsIn(['command', 'query'])
  kind!: 'command' | 'query';

  @IsString()
  @MaxLength(STATEMENT_MAX_LENGTH)
  statement!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_EVENTS)
  @IsString({ each: true })
  emits?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_EVENTS)
  @IsString({ each: true })
  onFailureEmits?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_EVENTS)
  @IsString({ each: true })
  consumes?: string[];

  @IsOptional()
  @IsIn(PROMPT_DIFFICULTIES)
  minDifficulty?: PromptDifficulty;
}

export class WorkflowIngestDto implements WorkflowIngest {
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  id!: string;

  @IsIn(['push', 'pull'])
  mode!: 'push' | 'pull';

  @IsString()
  @MaxLength(STATEMENT_MAX_LENGTH)
  statement!: string;

  /** Must name an NFR on the same prompt — a referential check, not a shape one. */
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  nfrId!: string;

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_EVENTS)
  @IsString({ each: true })
  emits!: string[];
}

export class WorkflowAggregationDto implements WorkflowAggregation {
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_ID_MAX_LENGTH)
  id!: string;

  @IsString()
  @MaxLength(STATEMENT_MAX_LENGTH)
  statement!: string;

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_EVENTS)
  @IsString({ each: true })
  sourceEventIds!: string[];

  @IsOptional()
  @IsIn(PROMPT_DIFFICULTIES)
  minDifficulty?: PromptDifficulty;
}

export class WorkflowSpecDto implements WorkflowSpec {
  @Equals(1)
  version!: 1;

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_ENTITIES)
  @ValidateNested({ each: true })
  @Type(() => WorkflowEntityDto)
  entities!: WorkflowEntityDto[];

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_OPERATIONS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowOperationDto)
  operations!: WorkflowOperationDto[];

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_EVENTS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowEventDto)
  events!: WorkflowEventDto[];

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_AGGREGATIONS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowAggregationDto)
  aggregations!: WorkflowAggregationDto[];

  @IsArray()
  @ArrayMaxSize(WORKFLOW_MAX_INGESTS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowIngestDto)
  ingests!: WorkflowIngestDto[];
}
