import * as fs from 'node:fs';
import * as path from 'node:path';
import { runGit, splitNul } from './run';

export interface Watcher {
  dispose(): void;
}

interface WatchOptions {
  readonly delay: number;
  readonly onChange: () => void;
  readonly onError: (error: unknown) => void;
}

export async function watchRepository(
  gitPath: string,
  root: string,
  { delay, onChange, onError }: WatchOptions,
): Promise<Watcher> {
  const [gitDir, commonDir] = (
    await runGit(gitPath, root, ['rev-parse', '--git-dir', '--git-common-dir'])
  )
    .trim()
    .split('\n')
    .map((dir) => path.resolve(root, dir.trim()));
  const gitDirs = [...new Set([gitDir, commonDir])];

  let disposed = false;
  let timer: NodeJS.Timeout | undefined;
  let gitDirChanged = false;
  const changedFiles = new Set<string>();

  const flush = async () => {
    timer = undefined;
    const files = [...changedFiles];
    const refresh = gitDirChanged;
    changedFiles.clear();
    gitDirChanged = false;
    try {
      if (
        !disposed &&
        (refresh || (await anyNotIgnored(gitPath, root, files)))
      ) {
        onChange();
      }
    } catch (error) {
      if (!disposed) {
        onError(error);
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  };
  const changed = (file: string) => {
    const inGitDir = gitDirs.find((dir) => isInside(dir, file));
    if (inGitDir !== undefined) {
      if (!isInternal(path.relative(inGitDir, file))) {
        gitDirChanged = true;
        schedule();
      }
    } else if (isInside(root, file)) {
      changedFiles.add(path.relative(root, file).split(path.sep).join('/'));
      schedule();
    }
  };

  const folders = [root, ...gitDirs.filter((dir) => !isInside(root, dir))];
  const watchers = folders.map((folder) => {
    const watcher = fs.watch(folder, { recursive: true }, (_event, file) => {
      if (file) {
        changed(path.join(folder, file));
      } else {
        gitDirChanged = true;
        schedule();
      }
    });
    watcher.on('error', onError);
    return watcher;
  });

  return {
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

function isInside(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

export function isInternal(inGitDir: string): boolean {
  const [first] = inGitDir.split(/[\\/]/);
  return (
    first === 'objects' ||
    first === 'logs' ||
    inGitDir.endsWith('.lock') ||
    inGitDir === ''
  );
}

async function anyNotIgnored(
  gitPath: string,
  root: string,
  files: readonly string[],
): Promise<boolean> {
  if (files.length === 0) {
    return false;
  }
  let output: string;
  try {
    output = await runGit(gitPath, root, ['check-ignore', '-z', '--stdin'], {
      input: files.map((file) => `${file}\0`).join(''),
      okExitCodes: [0, 1],
      pathspecMagic: true,
    });
  } catch {
    return true;
  }
  const ignored = new Set(splitNul(output).filter(Boolean));
  return files.some((file) => !ignored.has(file));
}
