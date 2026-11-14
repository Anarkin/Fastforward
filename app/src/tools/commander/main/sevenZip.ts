import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';

export interface SevenZipRun {
  readonly code: number | null;
  readonly output: string;
  readonly errors: string;
}

interface SevenZipOptions {
  readonly signal?: AbortSignal;
  readonly onOutput?: (text: string) => void;
  readonly input?: string;
  readonly cwd?: string;
  readonly pipeInto?: readonly string[];
}

export type SevenZip = (
  args: readonly string[],
  options?: SevenZipOptions,
) => Promise<SevenZipRun>;

export function sevenZipProgram(options: {
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly appPath: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}): string {
  const folder = options.packaged
    ? path.join(options.resourcesPath, '7zip')
    : path.join(
        options.appPath,
        'build',
        '7zip',
        `${options.platform}-${options.arch}`,
      );
  return path.join(folder, options.platform === 'win32' ? '7z.exe' : '7zz');
}

function decoded(chunks: readonly Buffer[]): string {
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function ended(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let failure: unknown;
    child.once('error', (error) => {
      failure = error;
      if (child.pid === undefined) {
        reject(error);
      }
    });
    child.once('close', (code) => {
      if (failure === undefined) {
        resolve(code);
      } else {
        reject(failure);
      }
    });
  });
}

function pipedCode(
  firstCode: number | null,
  lastCode: number | null,
  cutShort: boolean,
): number | null {
  if (cutShort) {
    return lastCode;
  }
  if (firstCode !== 0 && firstCode !== 1) {
    return firstCode;
  }
  return lastCode === 0 ? firstCode : lastCode;
}

export function sevenZipAt(program: string): SevenZip {
  return async (args, { signal, onOutput, input, cwd, pipeInto } = {}) => {
    const started = (each: readonly string[]) =>
      spawn(program, each, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        ...(signal !== undefined && { signal }),
        ...(cwd !== undefined && { cwd }),
      });
    const first = started(args);
    const last = pipeInto === undefined ? first : started(pipeInto);
    first.stdin.on('error', () => undefined);
    first.stdin.end(input);
    last.stdin.on('error', () => undefined);
    if (last !== first) {
      first.stdout.pipe(last.stdin);
    }
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    const streamed = new TextDecoder();
    const told = (chunk: Buffer) =>
      onOutput?.(streamed.decode(chunk, { stream: true }));
    last.stdout.on('data', (chunk: Buffer) => {
      output.push(chunk);
      if (last === first) {
        told(chunk);
      }
    });
    first.stderr.on('data', (chunk: Buffer) => {
      errors.push(chunk);
      if (last !== first) {
        told(chunk);
      }
    });
    let cutShort = false;
    if (last !== first) {
      last.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
      last.once('close', (lastEnded) => {
        if (
          lastEnded !== 0 &&
          first.exitCode === null &&
          first.signalCode === null
        ) {
          cutShort = true;
          first.kill();
        }
      });
    }
    const [firstCode, lastCode] = await Promise.all([
      ended(first),
      last === first ? undefined : ended(last),
    ]);
    const code =
      lastCode === undefined
        ? firstCode
        : pipedCode(firstCode, lastCode, cutShort);
    return { code, output: decoded(output), errors: decoded(errors) };
  };
}

const noPrompt = '-p-';

const lineBreak = /[\r\n]/;

export function listOf(paths: readonly string[]): string | undefined {
  return paths.some((each) => lineBreak.test(each))
    ? undefined
    : paths.map((each) => `"${each}"`).join('\n');
}

export function passwordGiven(password: string | undefined): {
  readonly switches: readonly string[];
  readonly input: string | undefined;
} {
  return password === undefined
    ? { switches: [noPrompt], input: undefined }
    : { switches: [], input: `${password}\n` };
}

export const packNames = ['-ssw', '-sccUTF-8', '-scsUTF-8', '-spd'];
