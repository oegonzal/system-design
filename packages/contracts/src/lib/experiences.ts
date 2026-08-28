import type { ApiListResponse, ApiResponse } from './envelope';
import type { IsoDateString, Uuid } from './primitives';

/**
 * The archetype decides which prompt-template family an experience feeds.
 * Seeded reference data only — the app never writes experiences.
 */
export const ARCHETYPES = [
  'flash-sale-ticketing',
  'media-streaming-pipeline',
  'workflow-automation',
  'realtime-analytics',
  'dag-orchestration',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** Concrete numbers lifted from the experience, used to scale prompt targets. */
export interface ScaleFacts {
  concurrentUsers?: number;
  requestsPerSecond?: number;
  dailyEvents?: number;
  dataVolumeGb?: number;
  peakMultiplier?: number;
  notes?: string;
}

export interface ExperienceProfileDto {
  id: Uuid;
  slug: string;
  companyLabel: string;
  title: string;
  summary: string;
  archetype: Archetype;
  techStack: string[];
  scaleFacts: ScaleFacts;
  highlights: string[];
  createdAt: IsoDateString;
}

export type ListExperiencesResponse = ApiListResponse<ExperienceProfileDto>;
export type GetExperienceResponse = ApiResponse<ExperienceProfileDto>;
