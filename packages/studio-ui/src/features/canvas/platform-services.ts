import {
  isPlatformServiceId,
  NODE_KINDS,
  platformCatalogue,
  platformServiceById,
  type NodeKind,
  type PlatformCatalogue,
  type PlatformService,
  type PlatformServiceId,
} from '@sysdesign/contracts';

/**
 * What a palette entry adds and a drag carries: a generic role, or a platform
 * service that plays one. The two vocabularies never share an id (the
 * contract's spec holds that), so a block is read as one or the other.
 */
export type PaletteBlock = NodeKind | PlatformServiceId;

export const isNodeKind = (value: string): value is NodeKind =>
  (NODE_KINDS as readonly string[]).includes(value);

export const isPaletteBlock = (value: string): value is PaletteBlock =>
  isNodeKind(value) || isPlatformServiceId(value);

/** The service a block names. Total: a block carries only an id the schema admits, so a miss is a contract defect, not a case. */
export function serviceOf(id: PlatformServiceId): PlatformService {
  const found = platformServiceById(id);
  if (found === null) throw new Error(`no platform offers the service ${id}`);
  return found.service;
}

/**
 * The catalogue a block's Service control lists: the session's platform when
 * it declares one, else the platform of the service the block already names
 * (a block drawn under a platform prompt and opened on a neutral session
 * still shows what it is), else none.
 */
export function catalogueFor(
  session: PlatformCatalogue | null,
  service: PlatformServiceId | undefined,
): PlatformCatalogue | null {
  if (session !== null) return session;
  if (service === undefined) return null;
  const found = platformServiceById(service);
  return found === null ? null : platformCatalogue(found.platformId);
}
