import {
  type ChildProcess,
  type SpawnOptionsWithStdioTuple,
  type StdioNull,
  type StdioPipe,
  spawn,
} from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { realTimer, type Timer } from '../tools/git/main/autoFetch';

const marker = '__FASTFORWARD_ENV__';

const carried = [
  'PATH',
  'SSH_AUTH_SOCK',
  'SSH_ASKPASS',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_SSH_VARIANT',
  'GIT_ASKPASS',
  'GIT_CONFIG_GLOBAL',
  'XDG_CONFIG_HOME',
  'GNUPGHOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
];

export type ShellEnv = Readonly<Record<string, string>>;

export async function withLoginShellEnv(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  readLoginShellEnv: typeof loginShellEnv = loginShellEnv,
): Promise<void> {
  if (platform === 'win32') {
    return;
  }
  const { PATH, ...rest } = (await readLoginShellEnv(env)) ?? {};
  Object.assign(env, rest);
  env.PATH = mergePaths(PATH, env.PATH, ':');
}

export async function loginShellEnv(
  env: NodeJS.ProcessEnv = process.env,
  timer: Timer = realTimer,
): Promise<ShellEnv | undefined> {
  const printed = [marker, ...carried.map((name) => `${name}=$${name}`), marker]
    .map((value) => `"${value}"`)
    .join(' ');
  const shell = spawn(
    env.SHELL || '/bin/sh',
    ['-ilc', `printf '%s\\0' ${printed}`],
    loginShellOptions(env),
  );
  return envFromShell(shell, timer);
}

export function loginShellOptions(
  env: NodeJS.ProcessEnv,
): SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioNull> {
  return { env, stdio: ['ignore', 'pipe', 'ignore'], detached: true };
}

export function envFromShell(
  shell: Pick<ChildProcess, 'stdout' | 'kill'> & EventEmitter,
  timer: Timer = realTimer,
): Promise<ShellEnv | undefined> {
  return new Promise((resolve) => {
    let output = '';
    const finish = (found: ShellEnv | undefined) => {
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
      const found = envFromOutput(output);
      if (found !== undefined) {
        finish(found);
      }
    });
  });
}

export function envFromOutput(output: string): ShellEnv | undefined {
  const opening = `${marker}\0`;
  const start = output.indexOf(opening);
  const end = output.indexOf(`\0${marker}\0`, start + opening.length - 1);
  if (start === -1 || end === -1) {
    return undefined;
  }
  return Object.fromEntries(
    output
      .slice(start + opening.length, end)
      .split('\0')
      .map((entry) => {
        const equals = entry.indexOf('=');
        return [entry.slice(0, equals), entry.slice(equals + 1)];
      })
      .filter(([name, value]) => carried.includes(name) && value !== ''),
  );
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
