export interface PartLook {
  readonly hidden: boolean;
  readonly file: boolean;
  readonly executable: boolean;
}

export interface PathLooks {
  readonly path: string;
  readonly parts: readonly (PartLook | null)[];
}

export const maxLookedPaths = 64;

export const maxLookedPathLength = 4096;

export function lookedPaths(value: unknown): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maxLookedPaths
  ) {
    return undefined;
  }
  const paths: unknown[] = value;
  return paths.every(
    (path): path is string =>
      typeof path === 'string' &&
      path.length > 0 &&
      path.length <= maxLookedPathLength,
  )
    ? paths
    : undefined;
}
