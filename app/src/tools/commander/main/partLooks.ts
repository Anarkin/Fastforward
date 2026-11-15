import * as path from 'node:path';
import { pathParts } from '../../../lib/shared/pathParts';
import type { PartLook, PathLooks } from '../../../lib/shared/partLooks';

interface LookedStats {
  isDirectory(): boolean;
  readonly mode: number;
}

export interface LookingFiles {
  hidden(file: string): Promise<boolean>;
  stat(file: string): Promise<LookedStats | undefined>;
}

const onShare = (file: string) => /^[\\/]{2}/.test(file);

async function partLook(
  part: string,
  files: LookingFiles,
  platform: string,
): Promise<PartLook | null> {
  const stats = await files.stat(part);
  if (stats === undefined) {
    return null;
  }
  const file = !stats.isDirectory();
  return {
    hidden: await files.hidden(part).catch(() => false),
    file,
    executable: platform !== 'win32' && file && (stats.mode & 0o111) !== 0,
  };
}

export function partLooksOf(
  paths: readonly string[],
  files: LookingFiles,
  platform: string,
): Promise<PathLooks[]> {
  const absolute = platform === 'win32' ? path.win32 : path.posix;
  return Promise.all(
    paths.map(async (file) => {
      const parts = pathParts(file);
      return {
        path: file,
        parts:
          onShare(file) || !absolute.isAbsolute(file)
            ? parts.map(() => null)
            : await Promise.all(
                parts.map((part) => partLook(part.path, files, platform)),
              ),
      };
    }),
  );
}
