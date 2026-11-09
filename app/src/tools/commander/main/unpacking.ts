import * as fs from 'node:fs';
import * as path from 'node:path';
import { itemsAt, type ArchiveAccess, type OpenedArchive } from './archives';
import type { TransferEvent } from './transferProtocol';
import type { ConnectTransfer } from './transfers';

export interface Unpacking {
  readonly archives: ArchiveAccess;
  readonly archive: OpenedArchive;
  readonly paths: readonly string[];
  readonly depth: number;
  readonly withoutFolders: boolean;
  readonly files: number;
  readonly bytes: number;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function unpackingFirst(
  { archives, archive, paths, depth, withoutFolders, files, bytes }: Unpacking,
  connect: ConnectTransfer,
): ConnectTransfer {
  return (listener) => {
    const aborting = new AbortController();
    let inner: ReturnType<ConnectTransfer> | undefined;
    let staging: string | undefined;
    let ended = false;
    const removeStaging = () => {
      if (staging !== undefined) {
        void fs.promises
          .rm(staging, { recursive: true, force: true, maxRetries: 3 })
          .catch(() => undefined);
      }
    };
    const end = (event: TransferEvent) => {
      if (!ended) {
        ended = true;
        removeStaging();
        listener.event(event);
      }
    };
    const fail = (reason: string) => {
      listener.event({
        type: 'failed',
        name: path.basename(archive.file),
        reason,
      });
      end({ type: 'done', stopped: false });
    };
    const begin = async (target: string) => {
      const extracted = await archives.extract(archive, paths, {
        signal: aborting.signal,
        withoutFolders,
        onProgress: (progress) =>
          listener.event({
            type: 'progress',
            progress: {
              files: progress.files,
              totalFiles: files,
              bytes: Math.round((bytes * progress.percent) / 100),
              totalBytes: bytes,
              ...(progress.current !== undefined && {
                current: progress.current,
              }),
            },
          }),
      });
      if (aborting.signal.aborted) {
        end({ type: 'done', stopped: true });
        return;
      }
      if (extracted.kind === 'refused') {
        fail(extracted.reason);
        return;
      }
      staging = extracted.folder;
      const sources = await itemsAt(staging, withoutFolders ? 0 : depth);
      inner = connect({
        event: (event) =>
          event.type === 'done' ? end(event) : listener.event(event),
        stopped: (code) => {
          removeStaging();
          listener.stopped(code);
        },
      });
      inner.send({ type: 'start', plan: { sources, target, move: true } });
    };
    return {
      send: (command) => {
        if (inner !== undefined) {
          inner.send(command);
        } else if (command.type === 'start') {
          begin(command.plan.target).catch((error: unknown) => {
            if (aborting.signal.aborted) {
              end({ type: 'done', stopped: true });
            } else {
              fail(reasonOf(error));
            }
          });
        } else if (command.type === 'stop') {
          aborting.abort();
        }
      },
      dispose: () => {
        aborting.abort();
        inner?.dispose();
        removeStaging();
      },
    };
  };
}
