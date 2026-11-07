import * as fs from 'node:fs';
import * as path from 'node:path';

const gitFolder = '.git';
const lookingAtOnce = 16;

async function kindOf(file: string): Promise<'folder' | 'file' | undefined> {
  try {
    return (await fs.promises.stat(file)).isDirectory() ? 'folder' : 'file';
  } catch {
    return undefined;
  }
}

const maxGitFileBytes = 4096;
const headRef = /^ref:\s*refs\//;
const headCommit = /^[0-9a-f]{40}(?:[0-9a-f]{24})?\s*$/;
const gitFileTarget = /^gitdir:\s*(.+?)\s*$/m;

async function startOf(file: string): Promise<string | undefined> {
  try {
    const handle = await fs.promises.open(file, 'r');
    try {
      const { buffer, bytesRead } = await handle.read({
        buffer: Buffer.alloc(maxGitFileBytes),
      });
      return buffer.toString('utf8', 0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

async function hasHead(folder: string): Promise<boolean> {
  const head = await startOf(path.join(folder, 'HEAD'));
  return head !== undefined && (headRef.test(head) || headCommit.test(head));
}

async function isGitDirectory(folder: string): Promise<boolean> {
  const [head, objects, refs] = await Promise.all([
    hasHead(folder),
    kindOf(path.join(folder, 'objects')),
    kindOf(path.join(folder, 'refs')),
  ]);
  return head && objects === 'folder' && refs === 'folder';
}

function volumeOf(file: string): string {
  const { root } = path.parse(path.resolve(file));
  return process.platform === 'win32' ? root.toLowerCase() : root;
}

export function onSameVolume(file: string, other: string): boolean {
  return volumeOf(file) === volumeOf(other);
}

async function pointsAtGitDirectory(
  folder: string,
  gitFile: string,
): Promise<boolean> {
  const target = gitFileTarget.exec((await startOf(gitFile)) ?? '')?.[1];
  if (target === undefined) {
    return false;
  }
  const gitDirectory = path.resolve(folder, target);
  return onSameVolume(gitDirectory, folder) && hasHead(gitDirectory);
}

export async function isRepository(folder: string): Promise<boolean> {
  const git = path.join(folder, gitFolder);
  switch (await kindOf(git)) {
    case 'folder':
      return isGitDirectory(git);
    case 'file':
      return pointsAtGitDirectory(folder, git);
    default:
      return false;
  }
}

export async function repositoriesIn(
  folder: string,
  names: readonly string[],
  isRepositoryAt: (folder: string) => Promise<boolean>,
  wanted: () => boolean = () => true,
): Promise<string[]> {
  const asked = names.filter((name) => name !== gitFolder);
  const found = Array.from({ length: asked.length }, () => false);
  let next = 0;
  const look = async () => {
    while (next < asked.length && wanted()) {
      const at = next++;
      found[at] = await isRepositoryAt(path.join(folder, asked[at])).catch(
        () => false,
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(lookingAtOnce, asked.length) }, look),
  );
  return asked.filter((_, at) => found[at]);
}
