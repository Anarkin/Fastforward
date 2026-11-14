import { type ChildProcess, execFile } from 'node:child_process';
import { join } from 'node:path';

type StoppableTree = Pick<
  ChildProcess,
  'pid' | 'exitCode' | 'signalCode' | 'kill'
>;

export async function stopTree(
  child: StoppableTree,
  platform: NodeJS.Platform = process.platform,
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
    await new Promise((resolve) => {
      execFile(
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
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}
