export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function codeOf(error: unknown): string | number | undefined {
  const code: unknown =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  return typeof code === 'string' || typeof code === 'number'
    ? code
    : undefined;
}

export function hasCode(error: unknown, ...codes: readonly string[]): boolean {
  const code = codeOf(error);
  return typeof code === 'string' && codes.includes(code);
}
