import { fsPromises as fs } from '../../../lib/main/files';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import { gitErrorText } from '../../../lib/main/errorText';
import { isFolder, sameFolder } from './folders';
import { runGit } from './run';

const noRepository =
  /not a git repository|must be run in a work tree|cannot use bare repository/;

export async function repositoryRoot(
  gitPath: string,
  folder: string,
): Promise<string | undefined> {
  let output: string;
  try {
    output = await runGit(gitPath, folder, [
      'rev-parse',
      '--is-inside-work-tree',
      '--show-cdup',
      '--show-toplevel',
    ]);
  } catch (error) {
    if (noRepository.test(gitErrorText(error)) || !(await isFolder(folder))) {
      return undefined;
    }
    throw error;
  }
  const [inside, up = '', top = ''] = output.split('\n');
  if (inside !== 'true') {
    return undefined;
  }
  const root = path.resolve(folder, up);
  return (await sameFolder(root, top)) ? root : path.resolve(top);
}

async function nearestFolder(file: string): Promise<string> {
  let folder = path.dirname(file);
  while (!(await isFolder(folder)) && path.dirname(folder) !== folder) {
    folder = path.dirname(folder);
  }
  return folder;
}

export async function fileInRepository(
  gitPath: string,
  file: string,
): Promise<{ readonly root: string; readonly path: string } | undefined> {
  const root = await repositoryRoot(gitPath, await nearestFolder(file));
  const inside = root === undefined ? '' : path.relative(root, file);
  return root === undefined ||
    inside === '' ||
    inside.startsWith('..') ||
    path.isAbsolute(inside)
    ? undefined
    : { root, path: inside.split(path.sep).join('/') };
}

export function hasGitFolder(folder: string): Promise<boolean> {
  return fs
    .lstat(path.join(folder, '.git'))
    .then(() => true)
    .catch(() => false);
}

export async function inFolderWithGit(folder: string): Promise<boolean> {
  for (let at = path.resolve(folder); ; at = path.dirname(at)) {
    if (await hasGitFolder(at)) {
      return true;
    }
    if (path.dirname(at) === at) {
      return false;
    }
  }
}

export async function initRepository(
  gitPath: string,
  folder: string,
): Promise<void> {
  if (!(await isFolder(folder))) {
    throw new Error(strings.common.gone(folder));
  }
  await runGit(gitPath, folder, ['init', '--quiet']);
}
