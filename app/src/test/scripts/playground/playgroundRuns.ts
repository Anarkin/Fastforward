import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import * as path from 'node:path';

export interface Ran {
  readonly code: number;
  readonly output: string;
}

export const playgroundScripts = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'scripts',
  'playground',
);

const running = new Map<ChildProcess, Promise<Ran>>();

export function runPlayground(
  script: string,
  folder: string,
  ...flags: string[]
): Promise<Ran> {
  const child = spawn(
    process.execPath,
    [path.join(playgroundScripts, script), folder, ...flags],
    {
      detached: process.platform !== 'win32',
      windowsHide: true,
    },
  );
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => {
    output += text;
  });
  child.stderr.setEncoding('utf8').on('data', (text: string) => {
    output += text;
  });
  const ran = new Promise<Ran>((resolve) => {
    child.on('error', (error) => {
      output += error.message;
    });
    child.on('close', (code) => {
      running.delete(child);
      resolve({ code: code ?? 1, output });
    });
  });
  running.set(child, ran);
  return ran;
}

function killWithItsChildren(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
      });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
}

export async function stopPlaygrounds(): Promise<void> {
  const closing = [...running];
  for (const [child] of closing) {
    killWithItsChildren(child);
  }
  await Promise.all(closing.map(([, closed]) => closed));
}
