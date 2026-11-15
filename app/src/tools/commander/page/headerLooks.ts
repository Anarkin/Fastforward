import type { PartLooks } from '../../../lib/page/pathLooks';
import { pathParts } from '../../../lib/shared/pathParts';

export function folderLooks(
  hidden: readonly boolean[],
  archive: string | undefined,
): PartLooks {
  const archivePart =
    archive === undefined ? undefined : pathParts(archive).length - 1;
  return hidden.map((each, index) => ({
    hidden: each,
    file: index === archivePart,
    executable: false,
  }));
}

export function fileLooks(hidden: readonly boolean[]): PartLooks {
  return hidden.map((each, index) => ({
    hidden: each,
    file: index === hidden.length - 1,
    executable: false,
  }));
}
