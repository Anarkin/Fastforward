import { execFile } from 'node:child_process';

const marker = '__FASTFORWARD_PATH__';

// Apps started from the macOS Dock or a Linux launcher get a bare PATH without
// what the user's shell profile adds, such as Homebrew, where git often is
export async function loginShellPath(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const shell = env.SHELL || '/bin/sh';
  const output = await new Promise<string>((resolve) => {
    execFile(
      shell,
      ['-ilc', `printf '%s' "${marker}" "$PATH" "${marker}"`],
      { env, timeout: 5000, encoding: 'utf8' },
      (error, stdout) => resolve(error ? '' : stdout),
    );
  });
  return pathFromOutput(output);
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
