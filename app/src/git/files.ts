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

type ObjectRead =
  | {
      readonly kind: 'object';
      readonly id: string;
      readonly type: string;
      readonly content: Buffer;
    }
  | { readonly kind: 'tooLarge'; readonly id: string }
  | { readonly kind: 'missing' };

async function readObjects(
  gitPath: string,
  cwd: string,
  names: readonly string[],
  limit: number,
): Promise<ObjectRead[]> {
  if (names.length === 0) {
    return [];
  }
  const output = await runGitBytes(
    gitPath,
    cwd,
    ['cat-file', '--batch', `--filter=blob:limit=${limit + 1}`],
    { input: batchInput(names) },
  );
  const read: ObjectRead[] = [];
  let at = 0;
  while (at < output.length && read.length < names.length) {
    const end = output.indexOf(10, at);
    const header = output.subarray(at, end).toString('utf8');
    at = end + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
      read.push({ kind: 'missing' });
      continue;
    }
    const [id = '', type = '', size] = header.split(' ');
    if (type === 'excluded') {
      read.push({ kind: 'tooLarge', id });
      continue;
    }
    const length = Number(size);
    read.push({
      kind: 'object',
      id,
      type,
      content: output.subarray(at, at + length),
    });
    at += length + 1;
  }
  return read;
}

function blobOf(
  read: ObjectRead | undefined,
): Exclude<ObjectRead, { kind: 'missing' }> | undefined {
  return read?.kind === 'tooLarge' ||
    (read?.kind === 'object' && read.type === 'blob')
    ? read
    : undefined;
}

export async function readBlobs(
  gitPath: string,
  cwd: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  for (const read of await readObjects(gitPath, cwd, ids, maxFileSize)) {
    const blob = blobOf(read);
    if (blob?.kind === 'object' && !isBinary(blob.content)) {
      texts.set(blob.id, blob.content.toString('utf8'));
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
  if (!path.includes('\n')) {
    const [read] = await readObjects(
      gitPath,
      cwd,
      [`${hash}:${path}`],
      maxFileSize,
    );
    const blob = blobOf(read);
    if (blob) {
      return blob.kind === 'tooLarge'
        ? binaryContent(blob.id)
        : toContent(blob.content, blob.id);
    }
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
  {
    path,
    id,
    disk,
    revision,
    untracked,
  }: Omit<ImageSource, 'root'> & { readonly untracked?: string },
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
  const blobNamed = async (name: string) =>
    blobOf((await readObjects(gitPath, cwd, [name], limit))[0]);
  const blob =
    (await blobNamed(revision === undefined ? id : `${revision}:${path}`)) ??
    (untracked === undefined
      ? undefined
      : await blobNamed(`${untracked}:${path}`));
  if (!blob) {
    return { kind: 'missing' };
  }
  return blob.kind === 'tooLarge'
    ? { kind: 'tooLarge' }
    : { kind: 'image', bytes: blob.content };
}
