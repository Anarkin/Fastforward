import { type ChildProcess, execFile } from 'node:child_process';
import { join } from 'node:path';
import type { ProcessHolder } from './processHold';

type StoppableTree = Pick<
  ChildProcess,
  'pid' | 'exitCode' | 'signalCode' | 'kill'
>;

export const treeStopWait = 5000;

type ProgramStarter = (
  file: string,
  args: readonly string[],
  options: { readonly windowsHide: boolean; readonly timeout: number },
  ended: (error: Error | null) => void,
) => unknown;

export async function stopTree(
  child: StoppableTree,
  platform: NodeJS.Platform,
  held: ProcessHolder,
  start: ProgramStarter = execFile,
): Promise<void> {
  if (
    child.exitCode !== null ||
    child.signalCode !== null ||
    child.pid === undefined
  ) {
    return;
  }
  const { pid } = child;
  if (platform === 'win32') {
    const release = held(pid);
    if (release === undefined) {
      return;
    }
    try {
      await new Promise((resolve, reject) => {
        const waited = setTimeout(resolve, treeStopWait);
        try {
          start(
            join(
              process.env.SystemRoot ?? 'C:\\Windows',
              'System32',
              'taskkill.exe',
            ),
            ['/pid', String(pid), '/t', '/f'],
            { windowsHide: true, timeout: treeStopWait },
            () => {
              clearTimeout(waited);
              resolve(undefined);
            },
          );
        } catch (error) {
          clearTimeout(waited);
          reject(error);
        }
      });
    } finally {
      release();
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}
