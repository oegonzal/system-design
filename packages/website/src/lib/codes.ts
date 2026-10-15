/** A NAICS code as SAM.gov lists it for an entity. */
export interface NaicsCode {
  readonly code: string;
  readonly title: string;
  /** The entity's primary NAICS code. */
  readonly primary?: true;
  /** The code listed a second time, under the size-standard exception this title names. */
  readonly sizeStandardException?: true;
}

/** A product or service code as SAM.gov lists it for an entity. */
export interface PscCode {
  readonly code: string;
  readonly title: string;
}

/** "111110 · Soybean Farming (primary)". */
export const formatNaics = ({ code, title, primary, sizeStandardException }: NaicsCode): string =>
  [
    `${code} · ${title}`,
    primary === true ? ' (primary)' : '',
    sizeStandardException === true ? ' (size standard exception)' : '',
  ].join('');

/** "A000 · Example Services". */
export const formatPsc = ({ code, title }: PscCode): string => `${code} · ${title}`;
