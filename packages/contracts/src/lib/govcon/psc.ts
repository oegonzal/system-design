/**
 * The product service code system's own first cut, as the federal
 * procurement data dictionary lays it out: a code that begins with a letter
 * names a service, and one that begins with a digit names a product.
 */
export const isServiceCode = (psc: string): boolean => /^[A-Za-z]/.test(psc);
