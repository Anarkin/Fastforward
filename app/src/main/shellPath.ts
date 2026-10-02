import { type ChildProcess, spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';

const marker = '__FASTFORWARD_PATH__';

// Apps started from the macOS Dock or a Linux launcher get a bare PATH without
// what the user's shell profile adds, such as Homebrew, where git often is
export async function loginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  timeout = 5000,
): Promise<string | undefined> {
  const shell = spawn(
    env.SHELL || '/bin/sh',
    ['-ilc', `printf '%s' "${marker}" "$PATH" "${marker}"`],
    { env, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return pathFromShell(shell, timeout);
}

// Interactive shells ignore SIGTERM, and what the profile starts in the
// background can hold stdout open long after the shell is gone
export function pathFromShell(
  shell: Pick<ChildProcess, 'stdout' | 'kill'> & EventEmitter,
  timeout: number,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let output = '';
    const finish = (found: string | undefined) => {
      clearTimeout(timer);
      shell.stdout?.destroy();
      resolve(found);
    };
    const timer = setTimeout(() => {
      shell.kill('SIGKILL');
      finish(undefined);
    }, timeout);
    shell.on('error', () => finish(undefined));
    shell.on('close', () => finish(undefined));
    shell.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
      const found = pathFromOutput(output);
      if (found !== undefined) {
        finish(found);
      }
    });
  });
}

export function pathFromOutput(output: string): string | undefined {
  const start = output.indexOf(marker);
  const end = output.indexOf(marker, start + marker.length);
  if (start === -1 || end === -1) {
    return undefined;
  }
  return output.slice(start + marker.length, end) || undefined;
}

export function mergePaths(
  first: string | undefined,
  second: string | undefined,
  delimiter: string,
): string {
  const folders = [
    ...(first ?? '').split(delimiter),
    ...(second ?? '').split(delimiter),
  ].filter(Boolean);
  return [...new Set(folders)].join(delimiter);
}
