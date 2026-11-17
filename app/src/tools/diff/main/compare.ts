import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname } from 'node:path';
import type { Compared } from '../../../shell/main/savedTabs';
import { maxImageSize } from '../../../components/diff/shared/imageSources';
import { patchByteBudget } from '../../../components/diff/shared/patchBudget';
import {
  diffArgs,
  diffOptionArgs,
  type PatchScope,
} from '../../../components/diff/main/args';
import type { ImageRead } from '../../../components/diff/main/imageReads';

interface GitRunOptions {
  readonly okExitCodes: readonly number[];
  readonly readsNoRepository: true;
  readonly env: NodeJS.ProcessEnv;
  readonly signal: AbortSignal | undefined;
  readonly onErrorOutput: (chunk: Buffer) => void;
}

export type GitRun = (
  cwd: string,
  args: readonly string[],
  options: GitRunOptions,
) => Promise<string>;

export const compareMaxBytes = patchByteBudget;

export class CompareTooLarge extends Error {}

export class CompareNotFile extends Error {}

export function checkedPatch(patch: string, errors: string): string {
  const said = errors
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('warning:'))
    .join('\n');
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
  return oldName === newName && old !== changed
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
  read: Compared,
  side: 'old' | 'new',
): Promise<string | undefined> {
  try {
    const [old, changed] = await regularFiles(read);
    return await readFile(side === 'old' ? old : changed, 'utf8');
  } catch {
    return undefined;
  }
}

function objectId(bytes: Buffer, length: number): string {
  return createHash(length === 64 ? 'sha256' : 'sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

export async function comparedImage(
  compared: Compared,
  path: string,
  id: string,
  limit = maxImageSize,
  read: Compared = compared,
): Promise<ImageRead> {
  const names = comparedNames(compared);
  const sides = [read.old, read.new].filter((_, side) => names[side] === path);
  for (const side of sides) {
    const file = await realpath(side).catch(() => undefined);
    const stats = file === undefined ? undefined : await stat(file);
    if (file === undefined || stats?.isFile() !== true) {
      continue;
    }
    if (stats.size > limit) {
      return { kind: 'tooLarge' };
    }
    const bytes = await readFile(file);
    if (objectId(bytes, id.length) === id) {
      return { kind: 'image', bytes };
    }
  }
  return { kind: 'missing' };
}

export async function filesAlike(
  read: Compared,
): Promise<'identical' | 'whitespace'> {
  const [old, changed] = await regularFiles(read);
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
  run: GitRun,
  compared: Compared,
  scope: Pick<PatchScope, 'entireFile' | 'ignoreWhitespace'> = {},
  signal?: AbortSignal,
  read: Compared = compared,
): Promise<string> {
  const [old, changed] = await regularFiles(read);
  const errors: Buffer[] = [];
  const outside = tmpdir();
  const patch = await run(
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
      old,
      changed,
    ],
    {
      okExitCodes: [0, 1],
      readsNoRepository: true,
      env: {
        GIT_CEILING_DIRECTORIES: dirname(outside),
        GIT_ATTR_NOSYSTEM: '1',
      },
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
