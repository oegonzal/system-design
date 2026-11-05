import type { PlatformCatalogue, PlatformService } from '../service';
import { AWS_CATEGORIES, type AwsCategoryId } from './categories';
import { COMPUTE_AND_NETWORKING } from './compute-networking';
import { INTEGRATION_AND_ANALYTICS } from './integration-analytics';
import { SECURITY_MANAGEMENT_AND_ML } from './security-management-ml';
import { STORAGE_AND_DATABASE } from './storage-database';

/**
 * The AWS catalogue: the core architecture set a system-design interview
 * reaches for, as declared data. Each module shelves one slice of it; this
 * file only joins them. A service is added as one more entry and a role it
 * may play as one more kind in its `roles` — nothing else learns of either.
 */
export const AWS_SERVICES = [
  ...COMPUTE_AND_NETWORKING,
  ...STORAGE_AND_DATABASE,
  ...INTEGRATION_AND_ANALYTICS,
  ...SECURITY_MANAGEMENT_AND_ML,
] as const satisfies readonly PlatformService<AwsCategoryId>[];

export const AWS = {
  id: 'aws',
  label: 'AWS',
  categories: AWS_CATEGORIES,
  services: AWS_SERVICES,
} as const satisfies PlatformCatalogue<AwsCategoryId>;
