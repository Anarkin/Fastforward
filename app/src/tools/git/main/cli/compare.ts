import { stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { Compared } from '../../../../shell/main/storage';
import { patchByteBudget } from '../../shared/protocol';
import { diffArgs, diffOptionArgs, type PatchScope } from './diff';
import { runGit } from './run';

export const compareMaxBytes = patchByteBudget;

export class CompareTooLarge extends Error {}

function headerLine(line: string, old: string, changed: string): string {
  if (line.startsWith('diff --git ')) {
    return `diff --git a/${old} b/${changed}`;
  }
  if (line.startsWith('--- ') && line !== '--- /dev/null') {
    return `--- a/${old}`;
  }
  if (line.startsWith('+++ ') && line !== '+++ /dev/null') {
    return `+++ b/${changed}`;
  }
  if (line.startsWith('Binary files ')) {
    return `Binary files a/${old} and b/${changed} differ`;
  }
  return line;
}

function namedPatch(patch: string, old: string, changed: string): string {
  if (patch === '') {
    return patch;
  }
  const hunks = patch.indexOf('\n@@');
  const header = hunks === -1 ? patch : patch.slice(0, hunks);
  const lines = header
    .split('\n')
    .map((line) => headerLine(line, old, changed));
  if (old !== changed) {
    lines.splice(1, 0, `rename from ${old}`, `rename to ${changed}`);
  }
  return lines.join('\n') + patch.slice(header.length);
}

export async function comparedFilesPatch(
  gitPath: string,
  compared: Compared,
  scope: Pick<PatchScope, 'entireFile' | 'ignoreWhitespace'> = {},
  signal?: AbortSignal,
): Promise<string> {
  const sizes = await Promise.all(
    [compared.old, compared.new].map(async (file) => (await stat(file)).size),
  );
  if (sizes.reduce((sum, size) => sum + size, 0) > compareMaxBytes) {
    throw new CompareTooLarge();
  }
  const patch = await runGit(
    gitPath,
    dirname(compared.new),
    [
      'diff',
      '--no-index',
      ...diffArgs,
      ...diffOptionArgs(scope),
      '--',
      compared.old,
      compared.new,
    ],
    { okExitCodes: [0, 1], signal },
  );
  return namedPatch(patch, basename(compared.old), basename(compared.new));
}
