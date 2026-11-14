import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { maxImageSize, type ImageSource } from '../shared/images';
import { linkMode } from '../shared/protocol';
import { isMissing } from '../../../lib/main/missing';
import { strings } from '../../../lib/shared/strings';
import { headCommit } from './commitLookup';
import { blobOf, indexMode, readObjects } from './objects';
import { runGit, runGitBytes } from './run';

export const maxFileSize = 2 * 1024 * 1024;
const binaryProbe = 8000;

interface FileContent {
  readonly content: string;
  readonly binary: boolean;
  readonly id?: string;
  readonly link?: true;
}

const binaryContent = (id: string): FileContent => ({
  content: '',
  binary: true,
  id,
});

const linkContent = (target: string): FileContent => ({
  content: target,
  binary: false,
  link: true,
});

const maxLinkTarget = 4096;

async function linkCheckedOutAsFile(
  gitPath: string,
  cwd: string,
  path: string,
  content: Buffer,
): Promise<boolean> {
  if (
    content.length === 0 ||
    content.length > maxLinkTarget ||
    content.includes(0x0a) ||
    content.includes(0)
  ) {
    return false;
  }
  return (await indexMode(gitPath, cwd, path)) === linkMode;
}

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

export async function readFile(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
  path: string,
): Promise<FileContent> {
  if (hash === undefined) {
    const file = repositoryFile(cwd, path);
    const stats = await lstatFollowingNoLink(cwd, file);
    if (!stats) {
      return { content: '', binary: false };
    }
    if (stats.isSymbolicLink()) {
      const target = await fs.readlink(file);
      return linkContent(
        process.platform === 'win32' ? target.replaceAll('\\', '/') : target,
      );
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
    if (!stats.isFile()) {
      return { content: '', binary: false };
    }
    const id = `${stats.size}-${stats.mtimeMs}`;
    if (stats.size > maxFileSize) {
      return binaryContent(id);
    }
    const content = await fs.readFile(file);
    return (await linkCheckedOutAsFile(gitPath, cwd, path, content))
      ? linkContent(content.toString('utf8'))
      : toContent(content, id);
  }
  const [read] = await readObjects(
    gitPath,
    cwd,
    [`${hash}:${path}`],
    maxFileSize,
  );
  const blob = blobOf(read);
  if (blob?.kind === 'object') {
    return blob.mode === linkMode
      ? linkContent(blob.content.toString('utf8'))
      : toContent(blob.content, blob.id);
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

export function repositoryFile(cwd: string, path: string): string {
  const file = join(cwd, path);
  const [first] = relative(cwd, file).split(sep);
  if (isAbsolute(path) || first === '..') {
    throw new Error(strings.errors.outsideRepository(path));
  }
  return file;
}

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

export type ImageRead =
  | { readonly kind: 'image'; readonly bytes: Buffer }
  | { readonly kind: 'missing' | 'tooLarge' };

export async function readImage(
  gitPath: string,
  cwd: string,
  { path, id, disk }: Omit<ImageSource, 'root'>,
  limit = maxImageSize,
): Promise<ImageRead> {
  if (disk) {
    const file = repositoryFile(cwd, path);
    const stats = await lstatFollowingNoLink(cwd, file);
    if (!stats?.isFile()) {
      return { kind: 'missing' };
    }
    return stats.size > limit
      ? { kind: 'tooLarge' }
      : { kind: 'image', bytes: await fs.readFile(file) };
  }
  const blob = blobOf((await readObjects(gitPath, cwd, [id], limit))[0]);
  if (!blob) {
    return { kind: 'missing' };
  }
  return blob.kind === 'tooLarge'
    ? { kind: 'tooLarge' }
    : { kind: 'image', bytes: blob.content };
}
