import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackOptions, Packing } from './archiveReader';
import { reasonOf } from '../../../lib/main/reasons';
import type { TransferEvent } from './transferProtocol';
import type { ConnectTransfer } from './transfers';

export function archiveJob(
  name: string,
  run: (options: PackOptions) => Promise<Packing>,
): ConnectTransfer {
  return (listener) => {
    const aborting = new AbortController();
    let ended = false;
    const end = (stopped: boolean) => {
      if (!ended) {
        ended = true;
        listener.event({ type: 'done', stopped });
      }
    };
    const told = (event: TransferEvent) => {
      if (!ended) {
        listener.event(event);
      }
    };
    const begin = async () => {
      let totals:
        { readonly files: number; readonly bytes: number } | undefined;
      let testing = false;
      const packed = await run({
        signal: aborting.signal,
        onTotals: (counted) => {
          totals = counted;
          told({
            type: 'progress',
            progress: {
              files: 0,
              totalFiles: counted.files,
              bytes: 0,
              totalBytes: counted.bytes,
            },
          });
        },
        onTesting: () => {
          testing = true;
          if (totals !== undefined) {
            told({
              type: 'progress',
              progress: {
                files: 0,
                totalFiles: totals.files,
                bytes: 0,
                totalBytes: totals.bytes,
                testing: true,
              },
            });
          }
        },
        onProgress: ({ percent, files: done, current }) => {
          if (totals !== undefined) {
            told({
              type: 'progress',
              progress: {
                files: done,
                totalFiles: totals.files,
                bytes: Math.round((totals.bytes * percent) / 100),
                totalBytes: totals.bytes,
                ...(current !== undefined && { current }),
                ...(testing && { testing: true }),
              },
            });
          }
        },
      });
      if (packed.kind === 'refused') {
        told({ type: 'failed', name, reason: packed.reason });
      } else if (packed.warning !== undefined) {
        told({ type: 'warned', reason: packed.warning });
      }
      end(false);
    };
    return {
      send: (command) => {
        if (command.type === 'start') {
          begin().catch((error: unknown) => {
            if (!aborting.signal.aborted) {
              told({ type: 'failed', name, reason: reasonOf(error) });
            }
            end(aborting.signal.aborted);
          });
        } else if (command.type === 'stop') {
          aborting.abort();
        }
      },
      dispose: () => aborting.abort(),
    };
  };
}

export function archiveTests(
  files: readonly string[],
  test: (file: string, options: PackOptions) => Promise<Packing>,
): ConnectTransfer {
  return (listener) => {
    const aborting = new AbortController();
    let ended = false;
    const end = (stopped: boolean) => {
      if (!ended) {
        ended = true;
        listener.event({ type: 'done', stopped });
      }
    };
    const told = (event: TransferEvent) => {
      if (!ended) {
        listener.event(event);
      }
    };
    const begin = async () => {
      const sizes = await Promise.all(
        files.map((file) =>
          fs.promises.stat(file).then(
            (stats) => stats.size,
            () => 0,
          ),
        ),
      );
      const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
      let done = 0;
      for (const [at, file] of files.entries()) {
        if (aborting.signal.aborted) {
          end(true);
          return;
        }
        const size = sizes[at] ?? 0;
        const name = path.basename(file);
        const tell = (percent: number) =>
          told({
            type: 'progress',
            progress: {
              files: at,
              totalFiles: files.length,
              bytes: done + Math.round((size * percent) / 100),
              totalBytes,
              current: name,
            },
          });
        tell(0);
        const tested = await test(file, {
          signal: aborting.signal,
          onProgress: ({ percent }) => tell(percent),
        });
        if (tested.kind === 'refused') {
          told({ type: 'failed', name, reason: tested.reason });
        }
        done += size;
      }
      end(false);
    };
    return {
      send: (command) => {
        if (command.type === 'start') {
          begin().catch((error: unknown) => {
            if (!aborting.signal.aborted) {
              told({
                type: 'failed',
                name: path.basename(files[0] ?? ''),
                reason: reasonOf(error),
              });
            }
            end(aborting.signal.aborted);
          });
        } else if (command.type === 'stop') {
          aborting.abort();
        }
      },
      dispose: () => aborting.abort(),
    };
  };
}
