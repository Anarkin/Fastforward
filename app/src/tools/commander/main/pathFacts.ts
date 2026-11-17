import * as path from 'node:path';
import type { PathFacts } from '../../../lib/shared/pathFacts';

export interface FactFinding {
  stat(file: string): Promise<{ isDirectory(): boolean } | undefined>;
  inRepository(folder: string): Promise<boolean>;
  gitMissing(): boolean;
}

async function kindOf(
  file: string,
  finding: FactFinding,
  paths: path.PlatformPath,
): Promise<PathFacts['kind']> {
  const stat = (at: string) => finding.stat(at);
  const stats = await stat(file);
  if (stats !== undefined) {
    return stats.isDirectory() ? 'folder' : 'file';
  }
  for (let at = paths.dirname(file); ; at = paths.dirname(at)) {
    const above = await stat(at);
    if (above !== undefined) {
      return above.isDirectory() ? 'missing' : 'inArchive';
    }
    if (paths.dirname(at) === at) {
      return 'missing';
    }
  }
}

export async function pathFactsOf(
  file: string,
  finding: FactFinding,
  platform: string,
): Promise<PathFacts> {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const kind = paths.isAbsolute(file)
    ? await kindOf(file, finding, paths)
    : 'missing';
  return {
    kind,
    inRepository:
      kind === 'folder' &&
      (await finding.inRepository(file).catch(() => false)),
    gitMissing: finding.gitMissing(),
  };
}
