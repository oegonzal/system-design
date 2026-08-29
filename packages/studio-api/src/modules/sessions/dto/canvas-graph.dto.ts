import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import {
  CANVAS_ID_MAX_LENGTH,
  CANVAS_MAX_EDGES,
  CANVAS_MAX_NODES,
  EDGE_KINDS,
  EDGE_LABEL_MAX_LENGTH,
  EDGE_MAX_CARRIES,
  NODE_KINDS,
  NODE_LABEL_MAX_LENGTH,
  NODE_MAX_OPERATIONS,
  NODE_MAX_RESPONSIBILITIES,
  OPERATION_KINDS,
  OPERATION_NAME_MAX_LENGTH,
  OPERATION_NOTES_MAX_LENGTH,
  RESPONSIBILITY_MAX_LENGTH,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type EdgeKind,
  type NodeConfig,
  type NodeKind,
  type NodeOperation,
  type OperationKind,
} from '@sysdesign/contracts';

import { ScalarRecordConstraint } from './scalar-record.constraint';

/**
 * Wire validation of a submitted canvas graph. Shape errors (bad kind, missing
 * id, oversize arrays) are caught here and answered with a 400; referential
 * errors (dangling edges, duplicate ids, self-loops) belong to
 * `graph-validator.ts` and answer 422 — the payload parsed fine but describes
 * an impossible graph.
 */
export class PositionDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

export class NodeOperationDto implements NodeOperation {
  @IsString()
  @IsNotEmpty()
  @MaxLength(OPERATION_NAME_MAX_LENGTH)
  name!: string;

  @IsIn([...OPERATION_KINDS])
  kind!: OperationKind;

  @IsOptional()
  @IsBoolean()
  idempotent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(OPERATION_NOTES_MAX_LENGTH)
  notes?: string;
}

export class CanvasNodeDto implements CanvasNode {
  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  id!: string;

  @IsIn([...NODE_KINDS])
  kind!: NodeKind;

  @IsString()
  @MaxLength(NODE_LABEL_MAX_LENGTH)
  label!: string;

  /** Per-node knobs the eval rules read; the constraint pins the flat-scalar shape. */
  @IsOptional()
  @Validate(ScalarRecordConstraint)
  config?: NodeConfig;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NODE_MAX_RESPONSIBILITIES)
  @IsString({ each: true })
  @MaxLength(RESPONSIBILITY_MAX_LENGTH, { each: true })
  responsibilities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NODE_MAX_OPERATIONS)
  @ValidateNested({ each: true })
  @Type(() => NodeOperationDto)
  operations?: NodeOperationDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}

export class CanvasEdgeDto implements CanvasEdge {
  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  id!: string;

  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  source!: string;

  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  target!: string;

  /** Defaults to `sync` when omitted — the contract's documented default. */
  @IsOptional()
  @IsIn([...EDGE_KINDS])
  kind?: EdgeKind;

  @IsOptional()
  @IsString()
  @MaxLength(EDGE_LABEL_MAX_LENGTH)
  label?: string;

  /** Operation-name references; whether each resolves is the eval's business. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EDGE_MAX_CARRIES)
  @IsString({ each: true })
  @MaxLength(OPERATION_NAME_MAX_LENGTH, { each: true })
  carries?: string[];
}

export class CanvasGraphDto implements CanvasGraph {
  @IsArray()
  @ArrayMaxSize(CANVAS_MAX_NODES)
  @ValidateNested({ each: true })
  @Type(() => CanvasNodeDto)
  nodes!: CanvasNodeDto[];

  @IsArray()
  @ArrayMaxSize(CANVAS_MAX_EDGES)
  @ValidateNested({ each: true })
  @Type(() => CanvasEdgeDto)
  edges!: CanvasEdgeDto[];
}
