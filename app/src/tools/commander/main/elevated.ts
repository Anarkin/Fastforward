import * as net from 'node:net';
import type { Entry } from '../shared/protocol';
import type { FileSystem } from './fileSystem';
import {
  lines,
  newHelperAddress,
  send,
  type HelperAddress,
  type HelperError,
} from './helper';

export type LaunchHelper = (address: HelperAddress) => Promise<boolean>;

export interface ElevatedFileSystem extends FileSystem {
  readonly closed: Promise<void>;
  close(): void;
}

const connectWithin = 60_000;

function errorFrom(error: HelperError): Error {
  return Object.assign(
    new Error(error.message),
    error.code === undefined ? {} : { code: error.code },
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function connected(
  server: net.Server,
  token: string,
  timeout: number,
): Promise<net.Socket | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeout);
    server.on('connection', (socket) => {
      let answered = false;
      lines(socket, (value) => {
        if (answered) {
          return;
        }
        answered = true;
        if (isObject(value) && value.token === token) {
          clearTimeout(timer);
          resolve(socket);
        } else {
          socket.destroy();
        }
      });
    });
  });
}

function overSocket(socket: net.Socket): ElevatedFileSystem {
  let next = 0;
  const waiting = new Map<
    number,
    {
      readonly resolve: (entries: readonly Entry[]) => void;
      readonly reject: (error: Error) => void;
    }
  >();
  const closed = new Promise<void>((resolve) => {
    socket.on('close', () => {
      for (const { reject } of waiting.values()) {
        reject(new Error('The helper stopped'));
      }
      waiting.clear();
      resolve();
    });
  });
  socket.on('error', () => socket.destroy());
  lines(socket, (value) => {
    if (!isObject(value) || typeof value.id !== 'number') {
      return;
    }
    const answer = waiting.get(value.id);
    waiting.delete(value.id);
    if (Array.isArray(value.entries)) {
      answer?.resolve(value.entries as readonly Entry[]);
    } else if (isObject(value.error)) {
      answer?.reject(
        errorFrom({
          message: String(value.error.message),
          ...(typeof value.error.code === 'string'
            ? { code: value.error.code }
            : {}),
        }),
      );
    }
  });
  return {
    closed,
    close: () => socket.destroy(),
    list: (folder) =>
      new Promise((resolve, reject) => {
        const id = ++next;
        waiting.set(id, { resolve, reject });
        send(socket, { id, folder });
      }),
    drives: () => Promise.resolve([]),
  };
}

export async function elevatedFileSystem(
  launch: LaunchHelper,
  platform: NodeJS.Platform,
  timeout = connectWithin,
): Promise<ElevatedFileSystem | undefined> {
  const address = newHelperAddress(platform);
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(address.pipe, resolve);
  });
  try {
    const connecting = connected(server, address.token, timeout);
    if (!(await launch(address))) {
      return undefined;
    }
    const socket = await connecting;
    return socket && overSocket(socket);
  } finally {
    server.close();
  }
}
