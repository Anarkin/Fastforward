import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  diffArgs,
  diffOptionArgs,
  type PatchScope,
} from '../../../components/diff/main/args';
import { runGit } from './run';

export async function decodedHunks(
  gitPath: string,
  copies: string,
  old: string,
  changed: string,
  scope: Pick<PatchScope, 'entireFile' | 'ignoreWhitespace'>,
): Promise<string> {
  const folder = join(
    copies,
    createHash('sha256').update(old).update('\0').update(changed).digest('hex'),
  );
  const oldFile = join(folder, 'old');
  const newFile = join(folder, 'new');
  await fs.mkdir(folder, { recursive: true });
  await Promise.all([
    fs.writeFile(oldFile, old, 'utf8'),
    fs.writeFile(newFile, changed, 'utf8'),
  ]);
  const outside = tmpdir();
  return runGit(
    gitPath,
    outside,
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.attributesFile=',
      'diff',
      '--no-index',
      ...diffArgs,
      ...diffOptionArgs(scope),
      '--',
      oldFile,
      newFile,
    ],
    {
      okExitCodes: [0, 1],
      readsNoRepository: true,
      env: {
        GIT_CEILING_DIRECTORIES: dirname(outside),
        GIT_ATTR_NOSYSTEM: '1',
      },
    },
  );
}
