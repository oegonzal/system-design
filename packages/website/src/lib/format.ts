/** "01", "02", …: the two-digit numeral the capability statement counts its lists with. */
export const numeral = (index: number): string => String(index).padStart(2, '0');
