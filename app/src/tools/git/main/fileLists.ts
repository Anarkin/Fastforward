import { runGit } from './run';
import { splitNul } from './splitNul';

export async function listTree(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
): Promise<string[]> {
  if (hash === undefined) {
    const [untracked, indexed] = await Promise.all([
      listUntracked(gitPath, cwd),
      listIndex(gitPath, cwd),
    ]);
    return uniquePaths(untracked, indexed);
  }
  const output = await runGit(gitPath, cwd, [
    'ls-tree',
    '-r',
    '-z',
    '--name-only',
    hash,
  ]);
  return uniquePaths(splitNul(output));
}

export function listIndex(gitPath: string, cwd: string): Promise<string[]> {
  return onDisk(gitPath, cwd, ['--cached']);
}

async function onDisk(
  gitPath: string,
  cwd: string,
  listed: readonly string[],
): Promise<string[]> {
  return splitNul(
    await runGit(gitPath, cwd, ['ls-files', '-z', '-t', ...listed]),
  ).flatMap((entry) =>
    entry === '' || entry.startsWith('S ') ? [] : [entry.slice(2)],
  );
}

export async function listUntracked(
  gitPath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const { args, paths } = untrackedListing();
  return paths(await runGit(gitPath, cwd, args, { signal }));
}

export function untrackedListing(platform = process.platform): {
  readonly args: readonly string[];
  readonly paths: (output: string) => string[];
} {
  if (platform !== 'win32') {
    return {
      args: ['ls-files', '--others', '--exclude-standard', '-z'],
      paths: (output) => splitNul(output).filter(Boolean),
    };
  }
  return {
    args: [
      '-c',
      'core.fscache=true',
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
      '--ignore-submodules=all',
      '--no-renames',
    ],
    paths: (output) =>
      splitNul(output).flatMap((record) =>
        record.startsWith('? ') ? [record.slice(2)] : [],
      ),
  };
}

export function uniquePaths(...lists: (readonly string[])[]): string[] {
  return [...new Set(lists.flat())].filter(Boolean);
}
