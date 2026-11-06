// A platform's managed services as declared data: the types and the ids
// (`service.ts`), each catalogue (`aws/`), the lookups over them
// (`catalogue.ts`) and the goal section the studio renders from one
// (`render.ts`).
export {
  isPlatformId,
  PLATFORM_IDS,
  type PlatformBoundary,
  type PlatformCatalogue,
  type PlatformCategory,
  type PlatformId,
  type PlatformService,
} from './service';
export {
  ALL_PLATFORM_SERVICE_IDS,
  isPlatformServiceId,
  PLATFORM_CATALOGUES,
  platformCatalogue,
  platformServiceById,
  servicesInCategory,
  type PlatformServiceId,
} from './catalogue';
export { PLATFORM_SECTION_HEADING, renderPlatformSection } from './render';
