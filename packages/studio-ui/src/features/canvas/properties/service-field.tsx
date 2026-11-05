'use client';

import {
  isPlatformServiceId,
  servicesInCategory,
  type PlatformCatalogue,
  type PlatformServiceId,
} from '@sysdesign/contracts';
import { SelectField } from '@sysdesign/design-system';

export interface ServiceFieldProps {
  catalogue: PlatformCatalogue;
  value: PlatformServiceId | null;
  onChange: (service: PlatformServiceId | null) => void;
}

const NONE = '';

/**
 * The platform service a block is, chosen from the catalogue's own shelves —
 * or none, for a block that is a plain role. The store keeps the block's kind
 * among the service's roles; this control only says which service.
 */
export function ServiceField({ catalogue, value, onChange }: ServiceFieldProps) {
  return (
    <SelectField
      label="Service"
      value={value ?? NONE}
      onChange={(event) =>
        onChange(isPlatformServiceId(event.target.value) ? event.target.value : null)
      }
      data-testid="service-select"
    >
      <option value={NONE}>None — role only</option>
      {catalogue.categories.map((category) => {
        const services = servicesInCategory(catalogue, category.id);
        if (services.length === 0) return null;
        return (
          <optgroup key={category.id} label={category.label}>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </SelectField>
  );
}
