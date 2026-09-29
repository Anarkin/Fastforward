import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { headCommit } from './history';
import { runGit, runGitBytes, splitNul } from './run';

// Every file of the repository at a commit, or in the working tree including
// untracked files; took 97 ms and 372 ms for 19k files
export async function listTree(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
): Promise<string[]> {
  const output = await runGit(
    gitPath,
    cwd,
    hash === undefined
      ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard']
      : ['ls-tree', '-r', '-z', '--name-only', hash],
  );
  return [...new Set(splitNul(output).filter(Boolean))];
}

// Files over this size, or with a NUL byte near the start, are shown as
// binary instead of their content
const maxFileSize = 2 * 1024 * 1024;
const binaryProbe = 8000;

interface FileContent {
  readonly content: string;
  readonly binary: boolean;
}

const binaryContent: FileContent = { content: '', binary: true };

function toContent(buffer: Buffer): FileContent {
  return buffer.subarray(0, binaryProbe).includes(0)
    ? binaryContent
    : { content: buffer.toString('utf8'), binary: false };
}

// A submodule is shown as git diffs it, by the commit it is at
function submoduleContent(hash: string | undefined): FileContent {
  return {
    content: hash ? `Subproject commit ${hash}\n` : '',
    binary: false,
  };
}

// A file's content at a commit, or in the working tree; its size is looked at
// first, so a huge file isn't read only to be shown as binary
export async function readFile(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
  path: string,
): Promise<FileContent> {
  if (hash === undefined) {
    const file = join(cwd, path);
    const stats = await fs.lstat(file).catch((error: unknown) => {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return undefined;
      }
      throw error;
    });
    // Deleted since it was listed, or left out of a sparse checkout
    if (!stats) {
      return { content: '', binary: false };
    }
    // As git stores it, by its target, not the file it points to
    if (stats.isSymbolicLink()) {
      const target = await fs.readlink(file);
      return {
        content:
          process.platform === 'win32' ? target.replaceAll('\\', '/') : target,
        binary: false,
      };
    }
    if (stats.isDirectory()) {
      // A submodule, or a repository inside this one; not one that isn't
      // checked out, as git would then find the outer repository
      const checkedOut = await fs.stat(join(file, '.git')).then(
        () => true,
        () => false,
      );
      return submoduleContent(
        checkedOut ? await headCommit(gitPath, file) : undefined,
      );
    }
    return stats.size > maxFileSize
      ? binaryContent
      : toContent(await fs.readFile(file));
  }
  // "<mode> <type> <object> <size>\t<path>", with a size only for files
  const entry = await runGit(gitPath, cwd, [
    'ls-tree',
    '-z',
    '--long',
    hash,
    '--',
    path,
  ]);
  const [mode, type, object, size] = entry
    .slice(0, entry.indexOf('\t'))
    .split(/ +/);
  if (!mode) {
    throw new Error(`${path} is not in ${hash}`);
  }
  if (type === 'commit') {
    return submoduleContent(object);
  }
  return Number(size) > maxFileSize
    ? binaryContent
    : toContent(await runGitBytes(gitPath, cwd, ['cat-file', 'blob', object]));
}
