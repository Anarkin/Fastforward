import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { CloneProgress } from '../../shared/clone';
import { strings } from '../../../../shared/strings';
import { isFolder, quietFor, remoteTimeout } from './repository';
import { runGit } from './run';

const progressLine =
  /^(?:remote: )?([^:]+):\s+(\d{1,3})% \(\d+\/\d+\)(?:, (.+))?$/;

export function progressOf(line: string): CloneProgress | undefined {
  const match = progressLine.exec(line.trim().replace(/,? done\.$/, ''));
  if (!match) {
    return undefined;
  }
  const [, phase, percent, detail] = match;
  return {
    phase,
    percent: Number(percent),
    ...(detail !== undefined && { detail }),
  };
}

export function progressReader(
  onProgress: (progress: CloneProgress) => void,
): (chunk: Buffer) => void {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  return (chunk) => {
    const lines = (pending + decoder.write(chunk)).split(/[\r\n]/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const progress = progressOf(line);
      if (progress) {
        onProgress(progress);
      }
    }
  };
}

export async function cloneTargetProblem(
  folder: string,
  name: string,
): Promise<string | undefined> {
  if (!path.isAbsolute(folder)) {
    return strings.clone.notFullPath(folder);
  }
  if (!(await isFolder(folder))) {
    return strings.clone.noFolder(folder);
  }
  const target = path.join(folder, name);
  try {
    const entries = await fs.readdir(target);
    return entries.length === 0 ? undefined : strings.clone.taken(target);
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? undefined
      : strings.clone.taken(target);
  }
}

export async function removeClone(
  target: string,
  keepFolder: boolean,
): Promise<void> {
  const removing = { recursive: true, force: true, maxRetries: 10 };
  if (!keepFolder) {
    await fs.rm(target, removing);
    return;
  }
  const entries = await fs.readdir(target).catch(() => []);
  await Promise.all(
    entries.map((entry) => fs.rm(path.join(target, entry), removing)),
  );
}

export async function cloneRepository(
  gitPath: string,
  folder: string,
  url: string,
  name: string,
  {
    timeout = remoteTimeout,
    stop = new AbortController().signal,
    onProgress = () => undefined,
  }: {
    readonly timeout?: number;
    readonly stop?: AbortSignal;
    readonly onProgress?: (progress: CloneProgress) => void;
  } = {},
): Promise<void> {
  const quiet = quietFor(timeout);
  try {
    await runGit(
      gitPath,
      folder,
      [
        '-c',
        'protocol.ext.allow=never',
        'clone',
        '--progress',
        '--end-of-options',
        url,
        name,
      ],
      {
        signal: AbortSignal.any([quiet.stalled, stop]),
        runsUserCode: true,
        onActivity: quiet.heard,
        onErrorOutput: progressReader(onProgress),
        progress: true,
      },
    );
  } catch (error) {
    if (quiet.stalled.aborted) {
      throw new Error(strings.errors.cloneStalled(Math.round(timeout / 1000)), {
        cause: error,
      });
    }
    throw error;
  } finally {
    quiet.end();
  }
}
