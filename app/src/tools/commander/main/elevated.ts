import * as net from 'node:net';
import { strings } from '../../../shared/strings';
import type { Entry } from '../shared/protocol';
import type { FileSystem } from './fileSystem';
import type { WatchFolder } from './watch';
import {
  lines,
  newHelperAddress,
  send,
  type HelperAddress,
  type HelperError,
} from './helper';

export type LaunchHelper = (address: HelperAddress) => Promise<boolean>;

export interface ElevatedFileSystem extends FileSystem {
  readonly watch: WatchFolder;
  readonly closed: Promise<void>;
  close(): void;
}

const connectWithin = 60_000;
const authenticateWithin = 10_000;
const longestSecret = 1024;

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
  authenticate: number,
): Promise<net.Socket> {
  return new Promise((resolve) => {
    server.on('connection', (socket) => {
      socket.on('error', () => socket.destroy());
      socket.setTimeout(authenticate, () => socket.destroy());
      let answered = false;
      const stop = lines(
        socket,
        (value) => {
          if (answered) {
            return;
          }
          answered = true;
          stop();
          socket.setTimeout(0);
          if (isObject(value) && value.token === token) {
            resolve(socket);
          } else {
            socket.destroy();
          }
        },
        longestSecret,
      );
    });
  });
}

async function within<T>(
  waiting: Promise<T>,
  timeout: number,
): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      waiting,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
  const watchers = new Map<number, () => void>();
  const closed = new Promise<void>((resolve) => {
    socket.on('close', () => {
      for (const { reject } of waiting.values()) {
        reject(new Error(strings.commander.helperGone));
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
    if (value.changed === true) {
      watchers.get(value.id)?.();
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
    watch: (folder, onChange) => {
      const id = ++next;
      watchers.set(id, onChange);
      send(socket, { id, folder, watch: true });
      return () => {
        watchers.delete(id);
        if (!socket.destroyed) {
          send(socket, { id, unwatch: true });
        }
      };
    },
  };
}

export async function elevatedFileSystem(
  launch: LaunchHelper,
  platform: NodeJS.Platform,
  timeout = connectWithin,
  authenticate = authenticateWithin,
): Promise<ElevatedFileSystem | undefined> {
  const address = newHelperAddress(platform);
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(address.pipe, resolve);
  });
  try {
    const connecting = connected(server, address.token, authenticate);
    if (!(await launch(address))) {
      return undefined;
    }
    const socket = await within(connecting, timeout);
    if (socket === undefined) {
      throw new Error(strings.commander.helperNotConnected);
    }
    return overSocket(socket);
  } finally {
    server.close();
  }
}
