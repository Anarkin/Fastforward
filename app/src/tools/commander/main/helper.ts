import * as net from 'node:net';
import * as path from 'node:path';
import type { FileSystem } from './fileSystem';
import {
  lines,
  send,
  type HelperAddress,
  type HelperError,
  type Request,
} from './helperProtocol';
import { watchFolder, type WatchFolder } from '../../../lib/main/watch';

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
