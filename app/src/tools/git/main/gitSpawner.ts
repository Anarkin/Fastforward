import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { join } from 'node:path';

export type OutputStream = 'stdout' | 'stderr';

export type ToSpawner =
  | {
      readonly type: 'spawn';
      readonly id: number;
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd: string;
      readonly env: NodeJS.ProcessEnv;
      readonly detached: boolean;
    }
  | {
      readonly type: 'input';
      readonly id: number;
      readonly data: Uint8Array | undefined;
      readonly end: boolean;
    }
  | {
      readonly type: 'closeOutput';
      readonly id: number;
      readonly stream: OutputStream;
    }
  | { readonly type: 'stop'; readonly id: number };

export type FromSpawner =
  | { readonly type: 'spawned'; readonly id: number; readonly pid?: number }
  | {
      readonly type: 'output';
      readonly id: number;
      readonly stream: OutputStream;
      readonly data: Uint8Array;
    }
  | {
      readonly type: 'error';
      readonly id: number;
      readonly message: string;
      readonly code?: string | number;
    }
  | {
      readonly type: 'exit' | 'close';
      readonly id: number;
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    }
  | { readonly type: 'stopped'; readonly id: number };

export interface SpawnerPort {
  postMessage(message: FromSpawner, transfer?: ArrayBuffer[]): void;
  on(event: 'message', listener: (message: ToSpawner) => void): unknown;
}

type StoppableTree = Pick<
  ChildProcess,
  'pid' | 'exitCode' | 'signalCode' | 'kill'
>;

export async function stopTree(
  child: StoppableTree,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (
    child.exitCode !== null ||
    child.signalCode !== null ||
    child.pid === undefined
  ) {
    return;
  }
  const { pid } = child;
  if (platform === 'win32') {
    await new Promise((resolve) => {
      execFile(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'taskkill.exe',
        ),
        ['/pid', String(pid), '/t', '/f'],
        { windowsHide: true },
        resolve,
      );
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}

function codeOf(error: unknown): string | number | undefined {
  const code: unknown =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;
  return typeof code === 'string' || typeof code === 'number'
    ? code
    : undefined;
}

export function serveGitSpawns(port: SpawnerPort): void {
  const children = new Map<number, ChildProcess>();
  const failed = (id: number, error: unknown) =>
    port.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
      ...(codeOf(error) === undefined ? {} : { code: codeOf(error) }),
    });
  const started = (message: Extract<ToSpawner, { type: 'spawn' }>) => {
    const { id } = message;
    let child: ChildProcess;
    try {
      child = spawn(message.command, [...message.args], {
        cwd: message.cwd,
        env: message.env,
        windowsHide: true,
        detached: message.detached,
      });
    } catch (error) {
      failed(id, error);
      return;
    }
    children.set(id, child);
    port.postMessage({
      type: 'spawned',
      id,
      ...(child.pid === undefined ? {} : { pid: child.pid }),
    });
    for (const stream of ['stdout', 'stderr'] as const) {
      child[stream]?.on('data', (data: Buffer) => {
        const bytes = new Uint8Array(data);
        port.postMessage({ type: 'output', id, stream, data: bytes }, [
          bytes.buffer,
        ]);
      });
    }
    child.stdin?.on('error', () => undefined);
    child.on('error', (error) => failed(id, error));
    child.on('exit', (code, signal) =>
      port.postMessage({ type: 'exit', id, code, signal }),
    );
    child.on('close', (code, signal) => {
      children.delete(id);
      port.postMessage({ type: 'close', id, code, signal });
    });
  };
  const stopped = async (id: number) => {
    const child = children.get(id);
    if (child !== undefined) {
      child.stdout?.destroy();
      child.stderr?.destroy();
      await stopTree(child);
    }
    port.postMessage({ type: 'stopped', id });
  };
  port.on('message', (message) => {
    switch (message.type) {
      case 'spawn':
        started(message);
        return;
      case 'input': {
        const input = children.get(message.id)?.stdin;
        if (message.data !== undefined) {
          input?.write(Buffer.from(message.data));
        }
        if (message.end) {
          input?.end();
        }
        return;
      }
      case 'closeOutput':
        children.get(message.id)?.[message.stream]?.destroy();
        return;
      case 'stop':
        void stopped(message.id);
        return;
      default:
        message satisfies never;
    }
  });
}
