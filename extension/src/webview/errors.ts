export const errorText = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);
