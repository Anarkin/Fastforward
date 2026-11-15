import {
  gitCommand,
  gitEnv,
  gitProcessOptions,
  unnamedBareRefused,
} from './gitCommand';
import { spawnGit, type GitChild } from './spawnedGit';

const monitors = new Map<string, Promise<string[]>>();

export function monitorArgs(gitPath: string, cwd: string): Promise<string[]> {
  const key = monitorKey(gitPath, cwd);
  const known = monitors.get(key);
  if (known !== undefined) {
    return known;
  }
  const { command, env } = gitCommand(gitPath);
  const read = answerOf(
    spawnGit(
      command,
      [
        ...unnamedBareRefused,
        'config',
        '--type=bool',
        '--get',
        'core.fsmonitor',
      ],
      {
        cwd,
        env: { ...gitEnv(), ...env },
        detached: gitProcessOptions().detached,
      },
    ),
  );
  const args = read.then((answer) => {
    if (answer === undefined && monitors.get(key) === args) {
      monitors.delete(key);
    }
    return [
      '-c',
      `core.fsmonitor=${answer?.code === 0 && answer.printed.trim() === 'true'}`,
    ];
  });
  monitors.set(key, args);
  return args;
}

function monitorKey(gitPath: string, cwd: string): string {
  return `${gitPath}\0${cwd}`;
}

export function forgetMonitor(cwd: string): void {
  for (const key of monitors.keys()) {
    if (key.endsWith(monitorKey('', cwd))) {
      monitors.delete(key);
    }
  }
}

const mostGitExitCode = 255;

function answerOf(
  child: GitChild,
): Promise<{ readonly code: number; readonly printed: string } | undefined> {
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stderr.resume();
  child.stdin.end();
  return new Promise((resolve) => {
    child.on('error', () => resolve(undefined));
    child.on('close', (code) =>
      resolve(
        code === null || code > mostGitExitCode
          ? undefined
          : { code, printed: Buffer.concat(chunks).toString('utf8') },
      ),
    );
  });
}
