import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { maxImageSize, type ImageSource } from '../shared/images';
import { strings } from '../shared/strings';
import { headCommit } from './history';
import { runGit, runGitBytes, splitNul } from './run';

export async function listTree(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
  untracked?: readonly string[],
): Promise<string[]> {
  const output = await runGit(
    gitPath,
    cwd,
    hash !== undefined
      ? ['ls-tree', '-r', '-z', '--name-only', hash]
      : untracked !== undefined
        ? ['ls-files', '-z', '--cached']
        : ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  );
  return [...new Set([...(untracked ?? []), ...splitNul(output)])].filter(
    Boolean,
  );
}

export const maxFileSize = 2 * 1024 * 1024;
const binaryProbe = 8000;

interface FileContent {
  readonly content: string;
  readonly binary: boolean;
  readonly id?: string;
}

const binaryContent = (id: string): FileContent => ({
  content: '',
  binary: true,
  id,
});

export function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, binaryProbe).includes(0);
}

function toContent(buffer: Buffer, id: string): FileContent {
  return isBinary(buffer)
    ? binaryContent(id)
    : { content: buffer.toString('utf8'), binary: false };
}

function submoduleContent(hash: string | undefined): FileContent {
  return {
    content: hash ? `Subproject commit ${hash}\n` : '',
    binary: false,
  };
}

const batchInput = (list: readonly string[]) =>
  list.map((id) => `${id}\n`).join('');

export async function blobSizes(
  gitPath: string,
  cwd: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  if (ids.length === 0) {
    return sizes;
  }
  const checked = await runGit(gitPath, cwd, ['cat-file', '--batch-check'], {
    input: batchInput(ids),
  });
  for (const line of checked.split('\n')) {
    const [id, type, size] = line.split(' ');
    if (type === 'blob') {
      sizes.set(id, Number(size));
    }
  }
  return sizes;
}

export async function readBlobs(
  gitPath: string,
  cwd: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  const small = [...(await blobSizes(gitPath, cwd, ids))].flatMap(
    ([id, size]) => (size <= maxFileSize ? [id] : []),
  );
  if (small.length === 0) {
    return texts;
  }
  const output = await runGitBytes(gitPath, cwd, ['cat-file', '--batch'], {
    input: batchInput(small),
  });
  let at = 0;
  while (at < output.length) {
    const end = output.indexOf(10, at);
    const [id, , size] = output.subarray(at, end).toString('utf8').split(' ');
    const content = output.subarray(end + 1, end + 1 + Number(size));
    at = end + 2 + Number(size);
    if (!isBinary(content)) {
      texts.set(id, content.toString('utf8'));
    }
  }
  return texts;
}

export function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

export async function readFile(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
  path: string,
): Promise<FileContent> {
  if (hash === undefined) {
    const file = repositoryFile(cwd, path);
    const stats = await lstatIfThere(file);
    if (!stats) {
      return { content: '', binary: false };
    }
    if (stats.isSymbolicLink()) {
      const target = await fs.readlink(file);
      return {
        content:
          process.platform === 'win32' ? target.replaceAll('\\', '/') : target,
        binary: false,
      };
    }
    if (stats.isDirectory()) {
      const checkedOut = await fs.stat(join(file, '.git')).then(
        () => true,
        () => false,
      );
      return submoduleContent(
        checkedOut ? await headCommit(gitPath, file) : undefined,
      );
    }
    const id = `${stats.size}-${stats.mtimeMs}`;
    return stats.size > maxFileSize
      ? binaryContent(id)
      : toContent(await fs.readFile(file), id);
  }
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
    throw new Error(strings.errors.notInCommit(path, hash));
  }
  if (type === 'commit') {
    return submoduleContent(object);
  }
  return Number(size) > maxFileSize
    ? binaryContent(object)
    : toContent(
        await runGitBytes(gitPath, cwd, ['cat-file', 'blob', object]),
        object,
      );
}

function repositoryFile(cwd: string, path: string): string {
  const file = join(cwd, path);
  const [first] = relative(cwd, file).split(sep);
  if (isAbsolute(path) || first === '..') {
    throw new Error(strings.errors.outsideRepository(path));
  }
  return file;
}

function lstatIfThere(file: string): Promise<Stats | undefined> {
  return fs.lstat(file).catch((error: unknown) => {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  });
}

export type ImageRead =
  | { readonly kind: 'image'; readonly bytes: Buffer }
  | { readonly kind: 'missing' | 'tooLarge' };

export async function readImage(
  gitPath: string,
  cwd: string,
  { path, id, disk, revision }: Omit<ImageSource, 'root'>,
  limit = maxImageSize,
): Promise<ImageRead> {
  if (disk) {
    const file = repositoryFile(cwd, path);
    const stats = await lstatIfThere(file);
    if (!stats?.isFile()) {
      return { kind: 'missing' };
    }
    return stats.size > limit
      ? { kind: 'tooLarge' }
      : { kind: 'image', bytes: await fs.readFile(file) };
  }
  const [object, size] =
    revision === undefined
      ? [id, (await blobSizes(gitPath, cwd, [id])).get(id)]
      : await blobAt(gitPath, cwd, `${revision}:${path}`);
  if (size === undefined) {
    return { kind: 'missing' };
  }
  return size > limit
    ? { kind: 'tooLarge' }
    : {
        kind: 'image',
        bytes: await runGitBytes(gitPath, cwd, ['cat-file', 'blob', object]),
      };
}

async function blobAt(
  gitPath: string,
  cwd: string,
  name: string,
): Promise<[string, number | undefined]> {
  const checked = await runGit(gitPath, cwd, ['cat-file', '--batch-check'], {
    input: batchInput([name]),
  });
  const [object = '', type, size] = checked.trim().split(' ');
  return [object, type === 'blob' ? Number(size) : undefined];
}
