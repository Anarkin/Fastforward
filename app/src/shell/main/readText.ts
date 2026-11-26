import { hasCode } from '../../lib/shared/errors';
import { fs } from '../../lib/main/files';

export function readText(file: string): string | Error | undefined {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    return hasCode(error, 'ENOENT')
      ? undefined
      : error instanceof Error
        ? error
        : new Error(String(error));
  }
}
