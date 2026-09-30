/**
 * The few numeric idioms every priced or compared figure shares. Rounding is
 * written the one way the trace has always written it, so a decision decided
 * again from recorded evidence compares equal to the recorded one.
 */

export const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/** To a tenth: every score, penalty and spread the trace records. */
export const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * To a ten-thousandth, as `round1` of a thousandfold — the form the weight
 * sum and the clamp scale were always recorded in, kept verbatim so old and
 * new traces agree to the last digit.
 */
export const round4 = (value: number): number => round1(value * 1000) / 1000;
