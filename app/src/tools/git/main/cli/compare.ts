import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { Compared } from '../../../../shell/main/storage';
import { patchByteBudget } from '../../shared/protocol';
import { diffArgs, diffOptionArgs, type PatchScope } from './diff';
import { runGit } from './run';

export const compareMaxBytes = patchByteBudget;

export class CompareTooLarge extends Error {}

export class CompareNotFile extends Error {}

export function checkedPatch(patch: string, errors: string): string {
  const said = errors.trim();
  if (patch === '' && said !== '') {
    throw new Error(said);
  }
  return patch;
}

export function comparedNames({
  old,
  new: changed,
}: Compared): readonly [string, string] {
  const oldName = basename(old);
  const newName = basename(changed);
  return oldName === newName
    ? [
        `${basename(dirname(old))}/${oldName}`,
        `${basename(dirname(changed))}/${newName}`,
      ]
    : [oldName, newName];
}

async function regularFiles(
  compared: Compared,
): Promise<readonly [string, string]> {
  const files = await Promise.all(
    [compared.old, compared.new].map((file) => realpath(file)),
  );
  const sizes = await Promise.all(
    files.map(async (file) => {
      const stats = await stat(file);
      if (!stats.isFile()) {
        throw new CompareNotFile();
      }
      return stats.size;
    }),
  );
  if (sizes.reduce((sum, size) => sum + size, 0) > compareMaxBytes) {
    throw new CompareTooLarge();
  }
  return [files[0] ?? compared.old, files[1] ?? compared.new];
}

export async function comparedText(
  compared: Compared,
  side: 'old' | 'new',
): Promise<string | undefined> {
  try {
    const [old, changed] = await regularFiles(compared);
    return await readFile(side === 'old' ? old : changed, 'utf8');
  } catch {
    return undefined;
  }
}

export async function filesAlike(
  compared: Compared,
): Promise<'identical' | 'whitespace'> {
  const [old, changed] = await regularFiles(compared);
  const [oldBytes, newBytes] = await Promise.all([
    readFile(old),
    readFile(changed),
  ]);
  return oldBytes.equals(newBytes) ? 'identical' : 'whitespace';
}

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
  const [old, changed] = await regularFiles(compared);
  const errors: Buffer[] = [];
  const patch = await runGit(
    gitPath,
    dirname(changed),
    [
      '-c',
      'core.autocrlf=false',
      'diff',
      '--no-index',
      ...diffArgs,
      ...diffOptionArgs(scope),
      '--',
      old,
      changed,
    ],
    {
      okExitCodes: [0, 1],
      readsNoRepository: true,
      signal,
      onErrorOutput: (chunk) => errors.push(chunk),
    },
  );
  const [oldName, newName] = comparedNames(compared);
  return namedPatch(
    checkedPatch(patch, Buffer.concat(errors).toString('utf8')),
    oldName,
    newName,
  );
}
