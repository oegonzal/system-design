import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  STORY_MAX_TAGS,
  STORY_SECTION_MAX_LENGTH,
  STORY_TAG_MAX_LENGTH,
  STORY_TITLE_MAX_LENGTH,
  type SaveStarStoryRequest,
} from '@sysdesign/contracts';

/** Shared by POST (create) and PUT (full replace) — the contract's shape. */
export class SaveStarStoryRequestDto implements SaveStarStoryRequest {
  /** Bounded by the column width, so Postgres never has to reject it. */
  @IsString()
  @MaxLength(STORY_TITLE_MAX_LENGTH)
  title!: string;

  @IsString()
  @MaxLength(STORY_SECTION_MAX_LENGTH)
  situation!: string;

  @IsString()
  @MaxLength(STORY_SECTION_MAX_LENGTH)
  task!: string;

  @IsString()
  @MaxLength(STORY_SECTION_MAX_LENGTH)
  action!: string;

  @IsString()
  @MaxLength(STORY_SECTION_MAX_LENGTH)
  result!: string;

  @IsArray()
  @ArrayMaxSize(STORY_MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(STORY_TAG_MAX_LENGTH, { each: true })
  tags!: string[];

  @IsOptional()
  @IsUUID()
  promptId?: string;

  @IsOptional()
  @IsUUID()
  experienceId?: string;
}
