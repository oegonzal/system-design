import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  MAX_LIST_LIMIT,
  PROMPT_DIFFICULTIES,
  PROMPT_STATUSES,
  type ListPromptsQuery,
  type PromptDifficulty,
  type PromptStatus,
} from '@sysdesign/contracts';

export class ListPromptsQueryDto implements ListPromptsQuery {
  @IsOptional()
  @IsUUID()
  experienceId?: string;

  @IsOptional()
  @IsIn([...PROMPT_DIFFICULTIES])
  difficulty?: PromptDifficulty;

  @IsOptional()
  @IsIn([...PROMPT_STATUSES])
  status?: PromptStatus;

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
