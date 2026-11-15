import { useEffect, useRef } from 'react';
import type { DiffFile } from './diff';

export function largeFilesToLoad(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  diff: number,
  requested: Map<string, number>,
): string[] {
  const load: string[] = [];
  for (const file of files) {
    if (!file.placeholder || toggled.get(file.path) !== true) {
      requested.delete(file.path);
    } else if (requested.get(file.path) !== diff) {
      requested.set(file.path, diff);
      load.push(file.path);
    }
  }
  return load;
}

export function useLargeFileLoads({
  files,
  toggled,
  diff,
  onLoad,
}: {
  readonly files: readonly DiffFile[];
  readonly toggled: ReadonlyMap<string, boolean>;
  readonly diff: number;
  readonly onLoad: (path: string) => void;
}): void {
  const requested = useRef(new Map<string, number>());
  useEffect(() => {
    for (const path of largeFilesToLoad(
      files,
      toggled,
      diff,
      requested.current,
    )) {
      onLoad(path);
    }
  }, [files, toggled, diff, onLoad]);
}
