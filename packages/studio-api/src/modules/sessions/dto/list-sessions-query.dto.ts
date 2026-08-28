import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_LIST_LIMIT, type ListSessionsQuery } from '@sysdesign/contracts';

export class ListSessionsQueryDto implements ListSessionsQuery {
  @IsOptional()
  @IsUUID()
  promptId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_LIMIT)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
