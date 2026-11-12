import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { maxImageSize, type ImageSource } from '../../shared/images';
import { linkMode } from '../../shared/protocol';
import { isFullHash } from '../../shared/hashes';
import {
  forbiddenCharacters,
  forbiddenEnd,
  reservedNames,
} from '../../shared/windowsNames';
import { strings } from '../../../../shared/strings';
import { gitDirOf } from './gitDir';
import { headCommit } from './history';
import { keptGits, runGit, runGitBytes, splitNul } from './run';

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

const batchInput = (list: readonly string[]) =>
  list.map((id) => `${id}\n`).join('');

const objectFormat = '%(objectname) %(objecttype) %(objectsize) %(objectmode)';

const keptCatFile = ['cat-file', `--batch-command=${objectFormat}`, '-Z'];

type ObjectInfo =
  | {
      readonly kind: 'found';
      readonly id: string;
      readonly type: string;
      readonly size: number;
      readonly mode: string;
    }
  | { readonly kind: 'missing' };

function parsedInfo(header: string): ObjectInfo {
  if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
    return { kind: 'missing' };
  }
  const [id = '', type = '', size = '', mode = ''] = header.split(' ');
  return { kind: 'found', id, type, size: Number(size), mode };
}

const fixedName = /^[0-9a-f]{40}(?:[0-9a-f]{24})?(?:$|:|\^1$)/;

const oneRequest = (name: string) => !/[\0\n]/.test(name);

const modeCheck = ['cat-file', '--batch-check=%(objectmode)', '-Z'];

async function indexStamp(cwd: string): Promise<string | undefined> {
  const gitDir = await gitDirOf(cwd);
  const stats =
    gitDir === undefined
      ? undefined
      : await fs.stat(join(gitDir, 'index')).catch(() => undefined);
  return stats && `${stats.size} ${stats.mtimeMs} ${stats.ino}`;
}

async function keptIndexMode(
  gitPath: string,
  cwd: string,
  name: string,
): Promise<string | undefined> {
  const stamp = oneRequest(name) ? await indexStamp(cwd) : undefined;
  const git =
    stamp === undefined
      ? undefined
      : await keptGits.use(gitPath, cwd, modeCheck, stamp);
  return git
    ?.request(`${name}\0`, async (output) =>
      (await output.until(0)).toString('utf8'),
    )
    .catch(() => undefined);
}

async function indexMode(
  gitPath: string,
  cwd: string,
  path: string,
): Promise<string> {
  const name = `:0:${path}`;
  return (
    (await keptIndexMode(gitPath, cwd, name)) ??
    (await runGit(gitPath, cwd, modeCheck, { input: `${name}\0` })).replace(
      /\0$/,
      '',
    )
  );
}

const mostKeptRead = 1024 * 1024;

async function keptInfo(
  gitPath: string,
  cwd: string,
  names: readonly string[],
  signal?: AbortSignal,
): Promise<ObjectInfo[] | undefined> {
  if (!names.every((name) => fixedName.test(name) && oneRequest(name))) {
    return undefined;
  }
  signal?.throwIfAborted();
  const git = await keptGits.use(gitPath, cwd, keptCatFile);
  if (git === undefined) {
    return undefined;
  }
  return git
    .request(
      names.map((name) => `info ${name}\0`).join(''),
      async (output) => {
        const infos: ObjectInfo[] = [];
        for (let index = 0; index < names.length; index++) {
          infos.push(parsedInfo((await output.until(0)).toString('utf8')));
        }
        return infos;
      },
      { signal },
    )
    .catch(() => {
      signal?.throwIfAborted();
      return undefined;
    });
}

export async function keptFirstParent(
  gitPath: string,
  cwd: string,
  hash: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const [commit, parent] =
    (await keptInfo(gitPath, cwd, [hash, `${hash}^1`], signal)) ?? [];
  return commit?.kind === 'found' &&
    commit.type === 'commit' &&
    parent?.kind === 'found' &&
    parent.type === 'commit'
    ? parent.id
    : undefined;
}

async function keptContents(
  gitPath: string,
  cwd: string,
  ids: readonly string[],
): Promise<Map<string, Buffer> | undefined> {
  const git = await keptGits.use(gitPath, cwd, keptCatFile);
  if (git === undefined) {
    return undefined;
  }
  return git
    .request(ids.map((id) => `contents ${id}\0`).join(''), async (output) => {
      const read = new Map<string, Buffer>();
      for (const id of ids) {
        const header = parsedInfo((await output.until(0)).toString('utf8'));
        if (header.kind === 'found') {
          read.set(id, await output.take(header.size));
          await output.take(1);
        }
      }
      return read;
    })
    .catch(() => undefined);
}

async function keptObjects(
  gitPath: string,
  cwd: string,
  names: readonly string[],
  limit: number,
): Promise<ObjectRead[] | undefined> {
  const infos = await keptInfo(gitPath, cwd, names);
  if (infos === undefined) {
    return undefined;
  }
  const wanted = infos.flatMap((info) =>
    info.kind === 'found' && (info.type !== 'blob' || info.size <= limit)
      ? [info]
      : [],
  );
  if (wanted.reduce((sum, info) => sum + info.size, 0) > mostKeptRead) {
    return undefined;
  }
  const contents = await keptContents(
    gitPath,
    cwd,
    wanted.map((info) => info.id),
  );
  if (contents === undefined) {
    return undefined;
  }
  return infos.map((info): ObjectRead => {
    if (info.kind === 'missing') {
      return info;
    }
    const content = contents.get(info.id);
    if (content !== undefined) {
      return {
        kind: 'object',
        id: info.id,
        type: info.type,
        mode: info.mode,
        content,
      };
    }
    return info.type === 'blob' && info.size > limit
      ? { kind: 'tooLarge' }
      : { kind: 'missing' };
  });
}

export async function blobSizes(
  gitPath: string,
  cwd: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  if (ids.length === 0) {
    return sizes;
  }
  const kept = await keptInfo(gitPath, cwd, ids);
  if (kept !== undefined) {
    for (const info of kept) {
      if (info.kind === 'found' && info.type === 'blob') {
        sizes.set(info.id, info.size);
      }
    }
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
      readonly mode: string;
      readonly content: Buffer;
    }
  | { readonly kind: 'tooLarge' }
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
  const kept = await keptObjects(gitPath, cwd, names, limit);
  if (kept !== undefined) {
    return kept;
  }
  const output = await runGitBytes(
    gitPath,
    cwd,
    [
      'cat-file',
      '--batch=%(objectname) %(objecttype) %(objectsize) %(objectmode)',
      '-Z',
      `--filter=blob:limit=${limit + 1}`,
    ],
    { input: names.map((name) => `${name}\0`).join('') },
  );
  const read: ObjectRead[] = [];
  let at = 0;
  while (at < output.length && read.length < names.length) {
    const end = output.indexOf(0, at);
    const header = output.subarray(at, end).toString('utf8');
    at = end + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
      read.push({ kind: 'missing' });
      continue;
    }
    if (header.endsWith(' excluded')) {
      read.push({ kind: 'tooLarge' });
      continue;
    }
    const [id = '', type = '', size, mode = ''] = header.split(' ');
    const length = Number(size);
    read.push({
      kind: 'object',
      id,
      type,
      mode,
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

async function lstatFollowingNoLink(
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

const maxViewedSize = 256 * 1024 * 1024;

export type ViewedFile =
  | { readonly kind: 'file'; readonly file: string }
  | { readonly kind: 'missing' | 'tooLarge' };

export async function viewedFile(
  gitPath: string,
  cwd: string,
  path: string,
  blob: string | undefined,
  copies: string,
): Promise<ViewedFile> {
  const file = repositoryFile(cwd, path);
  if (blob === undefined) {
    return (await lstatFollowingNoLink(cwd, file))?.isFile()
      ? { kind: 'file', file }
      : { kind: 'missing' };
  }
  if (!isFullHash(blob)) {
    return { kind: 'missing' };
  }
  const copy = join(copies, blob.toLowerCase(), copyName(basename(file)));
  const copying = copiesBeingWritten.get(copy);
  if (copying !== undefined) {
    return copying;
  }
  const written = copied(gitPath, cwd, blob, copy).finally(() =>
    copiesBeingWritten.delete(copy),
  );
  copiesBeingWritten.set(copy, written);
  return written;
}

const copiesBeingWritten = new Map<string, Promise<ViewedFile>>();

const unnamedOnWindows = new RegExp(forbiddenCharacters.source, 'gu');

function copyName(name: string): string {
  if (process.platform !== 'win32') {
    return name;
  }
  const kept = name
    .replaceAll(unnamedOnWindows, '_')
    .replace(forbiddenEnd, (end) => '_'.repeat(end.length));
  return reservedNames.test(kept) ? `_${kept}` : kept;
}

async function copied(
  gitPath: string,
  cwd: string,
  blob: string,
  copy: string,
): Promise<ViewedFile> {
  if ((await lstatIfThere(copy))?.isFile()) {
    return { kind: 'file', file: copy };
  }
  const read = blobOf(
    (await readObjects(gitPath, cwd, [blob], maxViewedSize))[0],
  );
  if (read === undefined) {
    return { kind: 'missing' };
  }
  if (read.kind === 'tooLarge') {
    return { kind: 'tooLarge' };
  }
  await fs.mkdir(dirname(copy), { recursive: true });
  const written = `${copy}.part`;
  await fs.writeFile(written, read.content);
  await fs.rename(written, copy);
  return { kind: 'file', file: copy };
}
