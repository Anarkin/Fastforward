import {
  type ChildProcess,
  type SpawnOptionsWithStdioTuple,
  type StdioNull,
  type StdioPipe,
  spawn,
} from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { realTimer, type Timer } from '../autoFetch';

const marker = '__FASTFORWARD_PATH__';

export async function withLoginShellPath(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  readLoginShellPath: typeof loginShellPath = loginShellPath,
): Promise<void> {
  if (platform !== 'win32') {
    env.PATH = mergePaths(await readLoginShellPath(env), env.PATH, ':');
  }
}

export async function loginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  timer: Timer = realTimer,
): Promise<string | undefined> {
  const shell = spawn(
    env.SHELL || '/bin/sh',
    ['-ilc', `printf '%s' "${marker}" "$PATH" "${marker}"`],
    loginShellOptions(env),
  );
  return pathFromShell(shell, timer);
}

export function loginShellOptions(
  env: NodeJS.ProcessEnv,
): SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioNull> {
  return { env, stdio: ['ignore', 'pipe', 'ignore'], detached: true };
}

export function pathFromShell(
  shell: Pick<ChildProcess, 'stdout' | 'kill'> & EventEmitter,
  timer: Timer = realTimer,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let output = '';
    const finish = (found: string | undefined) => {
      cancel();
      shell.stdout?.destroy();
      resolve(found);
    };
    const cancel = timer(() => {
      shell.kill('SIGKILL');
      finish(undefined);
    }, 5000);
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
