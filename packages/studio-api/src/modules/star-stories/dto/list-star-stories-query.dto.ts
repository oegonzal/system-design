import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import {
  MAX_LIST_LIMIT,
  STORY_SECTION_MAX_LENGTH,
  STORY_TAG_MAX_LENGTH,
  type ListStarStoriesQuery,
} from '@sysdesign/contracts';

export class ListStarStoriesQueryDto implements ListStarStoriesQuery {
  /** Case-insensitive contains over title, situation and result. */
  @IsOptional()
  @IsString()
  @MaxLength(STORY_SECTION_MAX_LENGTH)
  search?: string;

  /** Exact tag membership — a term longer than a tag can never match one. */
  @IsOptional()
  @IsString()
  @MaxLength(STORY_TAG_MAX_LENGTH)
  tag?: string;

  @IsOptional()
  @IsUUID()
  promptId?: string;

  @IsOptional()
  @IsUUID()
  experienceId?: string;

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
