import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { LineEnding } from '../shared/textMarks';

const run = promisify(execFile);

async function output(
  git: string,
  folder: string,
  args: readonly string[],
): Promise<string | undefined> {
  try {
    const { stdout } = await run(git, args, { cwd: folder, windowsHide: true });
    return stdout;
  } catch {
    return undefined;
  }
}

export interface GitEnding {
  readonly ending: LineEnding;
  readonly by: 'eol' | 'core.autocrlf' | 'core.eol';
}

export async function gitEndingOf(
  git: string,
  file: string,
): Promise<GitEnding | undefined> {
  const folder = path.dirname(file);
  const attributes = await output(git, folder, [
    'check-attr',
    'eol',
    'text',
    '--',
    path.basename(file),
  ]);
  if (attributes === undefined) {
    return undefined;
  }
  const eol = /: eol: (\S+)/.exec(attributes)?.[1];
  if (eol === 'lf' || eol === 'crlf') {
    return { ending: eol, by: 'eol' };
  }
  if (/: text: unset/.test(attributes)) {
    return undefined;
  }
  const autocrlf = (
    await output(git, folder, ['config', '--get', 'core.autocrlf'])
  )?.trim();
  if (autocrlf === 'true' || autocrlf === 'input') {
    return { ending: autocrlf === 'true' ? 'crlf' : 'lf', by: 'core.autocrlf' };
  }
  const configured = (
    await output(git, folder, ['config', '--get', 'core.eol'])
  )?.trim();
  return configured === 'lf' || configured === 'crlf'
    ? { ending: configured, by: 'core.eol' }
    : undefined;
}
