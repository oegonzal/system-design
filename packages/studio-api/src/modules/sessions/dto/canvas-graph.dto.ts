import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  CANVAS_ID_MAX_LENGTH,
  CANVAS_MAX_EDGES,
  CANVAS_MAX_NODES,
  EDGE_KINDS,
  EDGE_LABEL_MAX_LENGTH,
  NODE_KINDS,
  NODE_LABEL_MAX_LENGTH,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type EdgeKind,
  type NodeConfig,
  type NodeKind,
} from '@sysdesign/contracts';

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

export class CanvasNodeDto implements CanvasNode {
  @IsString()
  @MaxLength(CANVAS_ID_MAX_LENGTH)
  id!: string;

  @IsIn([...NODE_KINDS])
  kind!: NodeKind;

  @IsString()
  @MaxLength(NODE_LABEL_MAX_LENGTH)
  label!: string;

  /** Per-node knobs the eval rules read; values validated defensively there. */
  @IsOptional()
  @IsObject()
  config?: NodeConfig;

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
