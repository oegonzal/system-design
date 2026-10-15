/** A postal address in its parts: those structured data names, and the names prose uses. */
export interface PostalAddress {
  readonly street: string;
  readonly locality: string;
  /** The state's postal abbreviation, as an address line writes it. */
  readonly region: string;
  /** The state's name, as prose writes it. */
  readonly regionName: string;
  readonly postalCode: string;
  readonly country: string;
  /** ISO 3166-1 alpha-2, as structured data writes it. */
  readonly countryCode: string;
}

/** "1 Main St, Springfield, IL 62701-0001, United States". */
export const formatAddress = (address: PostalAddress): string =>
  `${address.street}, ${address.locality}, ${address.region} ${address.postalCode}, ${address.country}`;

/** "Springfield, Illinois". */
export const formatLocality = (address: PostalAddress): string =>
  `${address.locality}, ${address.regionName}`;
