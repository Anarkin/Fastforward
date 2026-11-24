import type { Stats } from '../../../lib/main/files';
import { fsPromises as fs } from '../../../lib/main/files';
import { dirname, join, relative, sep } from 'node:path';
import { isMissing } from '../../../lib/main/missing';

export function lstatIfThere(file: string): Promise<Stats | undefined> {
  return fs.lstat(file).catch((error: unknown) => {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  });
}

export async function lstatFollowingNoLink(
  cwd: string,
  file: string,
): Promise<Stats | undefined> {
  let folder = cwd;
  for (const name of relative(cwd, dirname(file)).split(sep)) {
    if (name) {
      folder = join(folder, name);
      if (!(await lstatIfThere(folder))?.isDirectory()) {
        return undefined;
      }
    }
  }
  return lstatIfThere(file);
}
