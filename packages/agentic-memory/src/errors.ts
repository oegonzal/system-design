/** What an error says, for a warning that names the fault rather than swallowing it. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
