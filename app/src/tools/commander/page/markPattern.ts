import type { Row } from './listing';

const regexSpecial = /[.+^${}()|[\]\\]/g;

export function namesIgnoreCase(platform: string | undefined): boolean {
  return platform === 'win32' || platform === 'darwin';
}

export function patternMatcher(
  pattern: string,
  platform: string | undefined,
): (name: string) => boolean {
  const flags = namesIgnoreCase(platform) ? 'i' : '';
  const patterns = pattern
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(
      (part) =>
        new RegExp(
          `^${part.replaceAll(regexSpecial, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`,
          flags,
        ),
    );
  return (name) => patterns.some((each) => each.test(name));
}

export function keysMatching(
  rows: readonly Row[],
  pattern: string,
  platform: string | undefined,
): string[] {
  const matches = patternMatcher(pattern, platform);
  return rows.flatMap((row) =>
    row.entry !== undefined && matches(row.entry.name) ? [row.key] : [],
  );
}
