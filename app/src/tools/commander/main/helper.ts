import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FileSystem } from './fileSystem';

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

interface Request {
  readonly id: number;
  readonly folder: string;
}

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
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'id') === 'number' &&
    typeof Reflect.get(value, 'folder') === 'string' &&
    path.isAbsolute(String(Reflect.get(value, 'folder')))
  );
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
): void {
  const socket = net.connect(pipe);
  socket.on('error', exit);
  socket.on('close', exit);
  send(socket, { token });
  lines(socket, (value) => {
    if (!isRequest(value)) {
      socket.destroy();
      return;
    }
    const { id, folder } = value;
    void fileSystem()
      .then((files) => files.list(folder))
      .then(
        (entries) => send(socket, { id, entries }),
        (error: unknown) => send(socket, { id, error: errorOf(error) }),
      );
  });
}
