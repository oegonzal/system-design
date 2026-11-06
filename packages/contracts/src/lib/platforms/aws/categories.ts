import type { PlatformCategory } from '../service';

/** AWS's own grouping of its services, in the order the palette shelves them. */
export const AWS_CATEGORIES = [
  { id: 'compute', label: 'Compute' },
  { id: 'networking', label: 'Networking & Content Delivery' },
  { id: 'storage', label: 'Storage' },
  { id: 'database', label: 'Database' },
  { id: 'integration', label: 'Application Integration' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'security', label: 'Security & Identity' },
  { id: 'management', label: 'Management & Observability' },
  { id: 'developer-tools', label: 'Developer Tools' },
  { id: 'ml', label: 'Machine Learning' },
] as const satisfies readonly PlatformCategory[];

export type AwsCategoryId = (typeof AWS_CATEGORIES)[number]['id'];
