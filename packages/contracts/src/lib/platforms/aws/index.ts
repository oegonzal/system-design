import type { PlatformBoundary, PlatformCatalogue, PlatformService } from '../service';
import { AWS_CATEGORIES, type AwsCategoryId } from './categories';
import { COMPUTE_AND_NETWORKING } from './compute-networking';
import { DEVELOPER_TOOLS } from './developer-tools';
import { INTEGRATION_AND_ANALYTICS } from './integration-analytics';
import { MACHINE_LEARNING } from './ml';
import { SECURITY_AND_MANAGEMENT } from './security-management';
import { STORAGE_AND_DATABASE } from './storage-database';

/**
 * The AWS catalogue: the services a production architecture is drawn with,
 * as declared data. Each module shelves one slice of it in the categories'
 * own order — the palette and the goal list services in this order; this
 * file only joins them. A service is added as one more entry and a role it
 * may play as one more kind in its `roles` — nothing else learns of either.
 */
export const AWS_SERVICES = [
  ...COMPUTE_AND_NETWORKING,
  ...STORAGE_AND_DATABASE,
  ...INTEGRATION_AND_ANALYTICS,
  ...SECURITY_AND_MANAGEMENT,
  ...DEVELOPER_TOOLS,
  ...MACHINE_LEARNING,
] as const satisfies readonly PlatformService<AwsCategoryId>[];

/** Where a block may sit, as AWS draws its boundaries — what a node's `boundary` names. */
export const AWS_BOUNDARIES = [
  {
    id: 'region',
    label: 'region',
    what: 'A geographic region: the blast radius of a regional failure and the unit of a multi-region design.',
  },
  {
    id: 'availability-zone',
    label: 'availability zone',
    what: 'An isolated data-centre group within a region; spreading over several survives one failing.',
  },
  {
    id: 'account',
    label: 'account',
    what: 'An isolated account: the billing and permission boundary between environments or teams.',
  },
  {
    id: 'vpc',
    label: 'VPC',
    what: 'A private network of subnets with its own routing; nothing enters but what a gateway, a load balancer or an endpoint admits.',
  },
  {
    id: 'public-subnet',
    label: 'public subnet',
    what: 'A subnet routed to the internet: only entry points — load balancers, NAT — belong here.',
  },
  {
    id: 'private-subnet',
    label: 'private subnet',
    what: 'A subnet with no route from the internet: services, workers and stores sit here, reached through the access layer.',
  },
  {
    id: 'security-group',
    label: 'security group',
    what: 'A per-block firewall stating which sources may reach which ports.',
  },
] as const satisfies readonly PlatformBoundary[];

export const AWS = {
  id: 'aws',
  label: 'AWS',
  categories: AWS_CATEGORIES,
  services: AWS_SERVICES,
  boundaries: AWS_BOUNDARIES,
} as const satisfies PlatformCatalogue<AwsCategoryId>;
