import * as fs from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { isFullHash } from '../shared/hashes';
import {
  forbiddenCharacters,
  forbiddenEnd,
  reservedNames,
} from '../shared/windowsNames';
import { repositoryFile } from './files';
import { lstatFollowingNoLink, lstatIfThere } from './fileStats';
import { blobOf, readObjects } from './objects';

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
