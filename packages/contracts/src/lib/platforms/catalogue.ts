import { AWS, AWS_SERVICES } from './aws';
import type { PlatformCatalogue, PlatformId, PlatformService } from './service';

/** Every declared platform, by id — `satisfies` so a new id in `PLATFORM_IDS` cannot land without its catalogue. */
export const PLATFORM_CATALOGUES = { aws: AWS } as const satisfies Record<
  PlatformId,
  PlatformCatalogue
>;

export const platformCatalogue = (id: PlatformId): PlatformCatalogue => PLATFORM_CATALOGUES[id];

/** The ids of a literal service tuple, typed as a tuple of their literals — the one cast, here, so `z.enum` can lock a node's `service` to them. */
const serviceIds = <const S extends readonly { readonly id: string }[]>(services: S) =>
  services.map((service) => service.id) as { readonly [K in keyof S]: S[K]['id'] };

/** Every service id of every platform, in catalogue order; a second platform spreads its tuple in here. */
export const ALL_PLATFORM_SERVICE_IDS = serviceIds(AWS_SERVICES);
export type PlatformServiceId = (typeof ALL_PLATFORM_SERVICE_IDS)[number];

export const isPlatformServiceId = (value: string): value is PlatformServiceId =>
  (ALL_PLATFORM_SERVICE_IDS as readonly string[]).includes(value);

/** A service and the platform that offers it, by the id a node names — a lookup over the catalogues, never a reading of the id's spelling. */
export function platformServiceById(
  serviceId: string,
): { readonly platformId: PlatformId; readonly service: PlatformService } | null {
  for (const catalogue of Object.values(PLATFORM_CATALOGUES)) {
    const service = catalogue.services.find((candidate) => candidate.id === serviceId);
    if (service !== undefined) return { platformId: catalogue.id, service };
  }
  return null;
}

/** The services on one of a platform's shelves, in catalogue order. */
export const servicesInCategory = (
  catalogue: PlatformCatalogue,
  categoryId: string,
): PlatformService[] => catalogue.services.filter((service) => service.category === categoryId);
