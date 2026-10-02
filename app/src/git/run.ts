import { type ChildProcess, execFile } from 'node:child_process';

export const gitConfigArgs = [
  '-c',
  'core.quotePath=false',
  '-c',
  'color.ui=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'diff.suppressBlankEmpty=false',
  '-c',
  'log.showRoot=true',
  '-c',
  'diff.submodule=short',
  '-c',
  'i18n.logOutputEncoding=UTF-8',
  '-c',
  // git diff refreshes the index even without optional locks
  'diff.autoRefreshIndex=false',
];

// Without optional locks, a refresh doesn't hold index.lock and make a commit
// the user runs elsewhere meanwhile fail
export function gitEnv(pathspecMagic = false): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_LITERAL_PATHSPECS: pathspecMagic ? '0' : '1',
  };
}

interface RunOptions {
  readonly okExitCodes?: readonly number[];
  readonly input?: string;
  readonly pathspecMagic?: boolean;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
}

const maxOutput = 256 * 1024 * 1024;

export async function runGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<string> {
  return (await runGitBytes(gitPath, cwd, args, options)).toString('utf8');
}

export function runGitBytes(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  { okExitCodes = [0], input, pathspecMagic, signal, env }: RunOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const stop = () => stopGit(child);
    const child = execFile(
      gitPath,
      [...gitConfigArgs, ...args],
      {
        cwd,
        env: { ...gitEnv(pathspecMagic), ...env },
        maxBuffer: maxOutput,
        windowsHide: true,
        encoding: 'buffer',
      },
      (error, stdout, stderr) => {
        signal?.removeEventListener('abort', stop);
        if (signal?.aborted) {
          reject(signal.reason);
        } else if (error && !exitedWith(error, okExitCodes)) {
          reject(
            new Error(
              `git ${args.join(' ')} failed: ${stderr.toString('utf8') || error.message}`,
            ),
          );
        } else {
          resolve(stdout);
        }
      },
    );
    signal?.addEventListener('abort', stop, { once: true });
    child.stdin?.end(input);
  });
}

// Git for Windows' cmd\git.exe only starts the real git, which outlives it
// being killed; running that git directly would lose the PATH the launcher
// sets for hooks, shell aliases and credential helpers
export function stopGit(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (process.platform === 'win32' && child.pid !== undefined) {
    execFile(
      'taskkill',
      ['/pid', String(child.pid), '/t', '/f'],
      { windowsHide: true },
      () => undefined,
    );
  } else {
    child.kill();
  }
}

export function exitedWith(
  error: { readonly code?: number | string | null },
  okExitCodes: readonly number[],
): boolean {
  return typeof error.code === 'number' && okExitCodes.includes(error.code);
}

export function splitNul(output: string): string[] {
  return output.split('\0');
}
