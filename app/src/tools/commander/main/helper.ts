import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FileSystem } from './fileSystem';
import { watchFolder, type WatchFolder } from './watch';

const pipeSwitch = '--commander-helper';
const tokenSwitch = '--commander-token';

export interface HelperAddress {
  readonly pipe: string;
  readonly token: string;
}

export function newHelperAddress(
  platform: NodeJS.Platform,
  temp = os.tmpdir(),
): HelperAddress {
  const name = `ff-${randomBytes(8).toString('hex')}`;
  return {
    pipe:
      platform === 'win32'
        ? `\\\\.\\pipe\\fastforward-helper-${name}`
        : path.posix.join(temp, `${name}.sock`),
    token: randomBytes(32).toString('hex'),
  };
}

export function helperArguments({ pipe, token }: HelperAddress): string[] {
  return [`${pipeSwitch}=${pipe}`, `${tokenSwitch}=${token}`];
}

export function helperOf(argv: readonly string[]): HelperAddress | undefined {
  const value = (name: string) =>
    argv
      .find((argument) => argument.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  const pipe = value(pipeSwitch);
  const token = value(tokenSwitch);
  return pipe && token ? { pipe, token } : undefined;
}

type Request =
  | { readonly id: number; readonly folder: string; readonly watch?: true }
  | { readonly id: number; readonly unwatch: true };

export interface HelperError {
  readonly code?: string;
  readonly message: string;
}

export function lines(
  socket: net.Socket,
  onLine: (value: unknown) => void,
): void {
  let buffered = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffered += chunk;
    for (
      let end = buffered.indexOf('\n');
      end !== -1;
      end = buffered.indexOf('\n')
    ) {
      const line = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      try {
        onLine(JSON.parse(line));
      } catch {
        socket.destroy();
      }
    }
  });
}

export function send(socket: net.Socket, value: unknown): void {
  socket.write(`${JSON.stringify(value)}\n`);
}

function isRequest(value: unknown): value is Request {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'id') !== 'number'
  ) {
    return false;
  }
  const folder: unknown = Reflect.get(value, 'folder');
  const watch: unknown = Reflect.get(value, 'watch');
  return Reflect.get(value, 'unwatch') === true
    ? folder === undefined
    : typeof folder === 'string' &&
        path.isAbsolute(folder) &&
        (watch === undefined || watch === true);
}

function errorOf(error: unknown): HelperError {
  const code =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
  return {
    ...(code === undefined ? {} : { code }),
    message: error instanceof Error ? error.message : String(error),
  };
}

export function runHelper(
  { pipe, token }: HelperAddress,
  fileSystem: () => Promise<FileSystem>,
  exit: () => void,
  watch: WatchFolder = watchFolder,
): void {
  const watchers = new Map<number, () => void>();
  const stop = () => {
    for (const unwatch of watchers.values()) {
      unwatch();
    }
    watchers.clear();
    exit();
  };
  const socket = net.connect(pipe);
  socket.on('error', stop);
  socket.on('close', stop);
  send(socket, { token });
  lines(socket, (value) => {
    if (!isRequest(value)) {
      socket.destroy();
      return;
    }
    const { id } = value;
    if ('unwatch' in value) {
      watchers.get(id)?.();
      watchers.delete(id);
      return;
    }
    const { folder } = value;
    if (value.watch === true) {
      watchers.get(id)?.();
      watchers.set(
        id,
        watch(folder, () => send(socket, { id, changed: true })),
      );
      return;
    }
    void fileSystem()
      .then((files) => files.list(folder))
      .then(
        (entries) => send(socket, { id, entries }),
        (error: unknown) => send(socket, { id, error: errorOf(error) }),
      );
  });
}
