export function gitErrorText(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const { stderr } = error;
    if (typeof stderr === 'string' && stderr.trim()) {
      return stderr.trim();
    }
  }
  return error instanceof Error ? error.message : String(error);
}
