import { type ChildProcess, execFile } from 'node:child_process';
import { join } from 'node:path';
import type { ProcessHolder } from './processHold';

type StoppableTree = Pick<
  ChildProcess,
  'pid' | 'exitCode' | 'signalCode' | 'kill'
>;

type ProgramStarter = (
  file: string,
  args: readonly string[],
  options: { readonly windowsHide: boolean },
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
      await new Promise((resolve) => {
        start(
          join(
            process.env.SystemRoot ?? 'C:\\Windows',
            'System32',
            'taskkill.exe',
          ),
          ['/pid', String(pid), '/t', '/f'],
          { windowsHide: true },
          resolve,
        );
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
