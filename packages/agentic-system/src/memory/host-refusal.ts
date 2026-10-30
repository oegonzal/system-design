import type { SpaceHostRefusal } from '@sysdesign/contracts';

/**
 * A request the memory host refuses before the runtime is asked, by one of the
 * host's own codes — declared with their statuses beside the runtime's in the
 * contracts (`SPACE_HOST_REFUSALS`, `space-host.ts`), so the HTTP door answers
 * each at its one status.
 */
export class HostRefused extends Error {
  constructor(
    readonly code: SpaceHostRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'HostRefused';
  }
}
