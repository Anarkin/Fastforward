import { execFile } from 'node:child_process';

// Settings of the user's config that would change the output: quoted
// non-ASCII paths, colors, signatures in the log, empty context lines, root
// commits without their files, submodules diffed as logs, and messages in
// another encoding than UTF-8
const configArgs = [
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
];

// Commands skip git's optional locks, so a refresh running while the user
// commits elsewhere doesn't hold index.lock and make that commit fail;
// paths are taken literally, so a file named "*.md" isn't a pattern
function env(pathspecMagic = false): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_LITERAL_PATHSPECS: pathspecMagic ? '0' : '1',
  };
}

interface RunOptions {
  // Exit codes that aren't failures, like git diff --no-index's 1 when the
  // files differ
  readonly okExitCodes?: readonly number[];
  // Written to the command's stdin
  readonly input?: string;
  // Allows pathspec magic like :(exclude), with paths marked literal
  readonly pathspecMagic?: boolean;
}

// The most output a command may have, like the history of a huge repository
const maxOutput = 256 * 1024 * 1024;

export async function runGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<string> {
  return (await runGitBytes(gitPath, cwd, args, options)).toString('utf8');
}

// The output as it is, for file contents, which may not be text
export function runGitBytes(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  { okExitCodes = [0], input, pathspecMagic }: RunOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      gitPath,
      [...configArgs, ...args],
      {
        cwd,
        env: env(pathspecMagic),
        maxBuffer: maxOutput,
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

// Whether git exited by itself with one of these codes; one killed by a
// signal has no code, and its output may be cut short
export function exitedWith(
  error: { readonly code?: number | string | null },
  okExitCodes: readonly number[],
): boolean {
  return typeof error.code === 'number' && okExitCodes.includes(error.code);
}

// Output of git commands run with -z
export function splitNul(output: string): string[] {
  return output.split('\0');
}
