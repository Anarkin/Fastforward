import * as fs from 'node:fs';

export function readText(file: string): string | Error | undefined {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    return isMissing(error)
      ? undefined
      : error instanceof Error
        ? error
        : new Error(String(error));
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
