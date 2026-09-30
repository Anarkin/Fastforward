import { execFile } from 'node:child_process';

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
  'diff.autoRefreshIndex=false',
];

// Commands skip git's optional locks and git diff its index refresh, so a
// refresh running while the user commits elsewhere doesn't hold index.lock and
// make that commit fail; and with no terminal to answer in, git fails rather
// than waits when it would prompt for credentials
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
  { okExitCodes = [0], input, pathspecMagic }: RunOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      gitPath,
      [...gitConfigArgs, ...args],
      {
        cwd,
        env: gitEnv(pathspecMagic),
        maxBuffer: maxOutput,
        windowsHide: true,
        encoding: 'buffer',
      },
      (error, stdout, stderr) => {
        if (error && !exitedWith(error, okExitCodes)) {
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
    child.stdin?.end(input);
  });
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
