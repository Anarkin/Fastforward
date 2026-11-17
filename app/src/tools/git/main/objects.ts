import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { gitDirOf } from './gitDir';
import { runningGits, runGit, runGitBytes } from './run';

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
      : await runningGits.use(gitPath, cwd, modeCheck, stamp);
  return git
    ?.request(`${name}\0`, async (output) =>
      (await output.until(0)).toString('utf8'),
    )
    .catch(() => undefined);
}

export async function indexMode(
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
  const git = await runningGits.use(gitPath, cwd, keptCatFile);
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
  const git = await runningGits.use(gitPath, cwd, keptCatFile);
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

export type ObjectRead =
  | {
      readonly kind: 'object';
      readonly id: string;
      readonly type: string;
      readonly mode: string;
      readonly content: Buffer;
    }
  | { readonly kind: 'tooLarge' }
  | { readonly kind: 'missing' };

export async function readObjects(
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

export function blobOf(
  read: ObjectRead | undefined,
): Exclude<ObjectRead, { kind: 'missing' }> | undefined {
  return read?.kind === 'tooLarge' ||
    (read?.kind === 'object' && read.type === 'blob')
    ? read
    : undefined;
}
