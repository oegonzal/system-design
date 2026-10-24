/** What an error says, for a message that names the fault rather than swallowing it. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
