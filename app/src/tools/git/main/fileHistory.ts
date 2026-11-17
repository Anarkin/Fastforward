import * as path from 'node:path';
import { fileInRepository } from './repository';
import { runGit } from './run';
import { blobAt } from './objects';

interface FileHistoryVersion {
  readonly rev: string;
  readonly path: string;
  readonly date: number;
  readonly subject: string;
  readonly gone: boolean;
}

export interface FileHistory {
  readonly versions: readonly FileHistoryVersion[];
  readonly staged: boolean;
  readonly changed: boolean;
}

const recordStart = '\u0001';

function versionsOf(log: string, root: string): FileHistoryVersion[] {
  return log.split(recordStart).flatMap((record) => {
    const [hash = '', time = '', subject = '', change = '', ...paths] =
      record.split('\0');
    const status = change.trim();
    const named = /^[RC]/.test(status) ? paths[1] : paths[0];
    return hash === '' || status === '' || named === undefined
      ? []
      : [
          {
            rev: hash,
            path: path.join(root, ...named.split('/')),
            date: Number(time) * 1000,
            subject,
            gone: status === 'D',
          },
        ];
  });
}

function diskId(
  gitPath: string,
  root: string,
  file: string,
): Promise<string | undefined> {
  return runGit(gitPath, root, ['hash-object', '--', file]).then(
    (id) => id.trim(),
    () => undefined,
  );
}

export async function fileHistory(
  gitPath: string,
  file: string,
): Promise<FileHistory | undefined> {
  const at = await fileInRepository(gitPath, file);
  if (at === undefined) {
    return undefined;
  }
  const [log, onDisk, inIndex, atHead] = await Promise.all([
    runGit(gitPath, at.root, [
      'log',
      '--follow',
      '-z',
      '--name-status',
      `--format=${recordStart}%H%x00%ct%x00%s`,
      '--',
      at.path,
    ]),
    diskId(gitPath, at.root, at.path),
    blobAt(gitPath, at.root, 'index', at.path),
    blobAt(gitPath, at.root, 'HEAD', at.path),
  ]);
  const versions = versionsOf(log, at.root);
  const [newest] = versions;
  return {
    versions,
    staged: inIndex !== undefined && inIndex !== onDisk && inIndex !== atHead,
    changed:
      newest === undefined ||
      newest.gone ||
      onDisk === undefined ||
      onDisk !== atHead,
  };
}
