import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

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

export type Request =
  | { readonly id: number; readonly folder: string; readonly watch?: true }
  | { readonly id: number; readonly unwatch: true };

export interface HelperError {
  readonly code?: string;
  readonly message: string;
}

export function lines(
  socket: net.Socket,
  onLine: (value: unknown) => void,
  longest = Infinity,
): () => void {
  let buffered = '';
  socket.setEncoding('utf8');
  const onData = (chunk: string) => {
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
    if (buffered.length > longest) {
      socket.destroy();
    }
  };
  socket.on('data', onData);
  return () => socket.off('data', onData);
}

export function send(socket: net.Socket, value: unknown): void {
  socket.write(`${JSON.stringify(value)}\n`);
}
