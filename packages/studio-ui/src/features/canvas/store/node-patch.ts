import type { ConfigEntry, NodeKind, NodeOperation, PlatformServiceId } from '@sysdesign/contracts';

import { serviceOf } from '../platform-services';
import type { SdNodeData } from '../types';

/** What an author's edit may change on a block; `service: null` takes the service off. */
export interface NodePatch {
  label?: string;
  kind?: NodeKind;
  service?: PlatformServiceId | null;
  config?: ConfigEntry[];
  responsibilities?: string[];
  operations?: NodeOperation[];
}

const plays = (service: PlatformServiceId, kind: NodeKind): boolean =>
  (serviceOf(service).roles as readonly string[]).includes(kind);

/**
 * A block's data after an edit, under the one invariant the contract's
 * validator holds: a block that names a service plays one of that service's
 * roles. Naming a service keeps the kind when the service plays it and takes
 * the service's first role otherwise; changing the kind to a role the named
 * service does not play takes the service off. Stated here once, so no
 * control has to know it.
 */
export function patchedNodeData(data: SdNodeData, patch: NodePatch): SdNodeData {
  const { service: askedService, kind: askedKind, ...rest } = patch;
  const { service: current, ...kept } = { ...data, ...rest };
  const kind = askedKind ?? kept.kind;
  if (askedService === null) return { ...kept, kind };
  const service = askedService ?? current;
  if (service === undefined) return { ...kept, kind };
  if (askedService !== undefined) {
    return { ...kept, service, kind: plays(service, kind) ? kind : serviceOf(service).roles[0] };
  }
  return plays(service, kind) ? { ...kept, service, kind } : { ...kept, kind };
}
