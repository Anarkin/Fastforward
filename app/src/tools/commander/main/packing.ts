import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArchiveReader, PackOptions, PackPlan, Packing } from './archives';
import { strings } from '../../../lib/shared/strings';
import { encrypts } from '../shared/packing';
import { reasonOf } from './reasons';
import type { TransferEvent } from './transferProtocol';
import type { ConnectTransfer } from './transfers';

const partNumber = /^\.(\d{3,})$/;

function partName(archive: string, number: number): string {
  return `${archive}.${String(number).padStart(3, '0')}`;
}

async function partsOf(file: string): Promise<string[]> {
  const folder = path.dirname(file);
  const name = path.basename(file);
  const names = await fs.promises.readdir(folder).catch(() => []);
  return names
    .flatMap((each) => {
      const [, number] = each.startsWith(name)
        ? (partNumber.exec(each.slice(name.length)) ?? [])
        : [];
      return number === undefined ? [] : [{ each, number: Number(number) }];
    })
    .toSorted((one, other) => one.number - other.number)
    .map(({ each }) => path.join(folder, each));
}

async function removed(files: readonly string[]): Promise<void> {
  await Promise.all(
    files.map((file) =>
      fs.promises.rm(file, { force: true }).catch(() => undefined),
    ),
  );
}

async function placed(temporary: string, plan: PackPlan): Promise<void> {
  if (plan.volumeBytes === undefined) {
    await fs.promises.rename(temporary, plan.archive);
    return;
  }
  const made = await partsOf(temporary);
  for (const part of made) {
    await fs.promises.rename(
      part,
      `${plan.archive}${part.slice(temporary.length)}`,
    );
  }
  const left = new Set(await partsOf(plan.archive));
  const beyond: string[] = [];
  for (
    let number = made.length + 1;
    left.has(partName(plan.archive, number));
    number++
  ) {
    beyond.push(partName(plan.archive, number));
  }
  await removed(beyond);
}

const temporaryEnding = /^\.[0-9a-f]{8}\.packing(?:\.\d+|\.paths)?$/;

const writing = new Set<string>();

async function leftBefore(archive: string): Promise<void> {
  const folder = path.dirname(archive);
  const name = path.basename(archive);
  const names = await fs.promises.readdir(folder).catch(() => []);
  await removed(
    names.flatMap((each) => {
      const file = path.join(folder, each);
      return each.startsWith(`${name}.`) &&
        temporaryEnding.test(each.slice(name.length)) &&
        !writing.has(file.replace(/\.(?:\d+|paths)$/, ''))
        ? [file]
        : [];
    }),
  );
}

export async function packInto(
  reader: ArchiveReader,
  plan: PackPlan,
  options: PackOptions = {},
): Promise<Packing> {
  await leftBefore(plan.archive);
  const temporary = `${plan.archive}.${randomUUID().slice(0, 8)}.packing`;
  writing.add(temporary);
  const leftovers = async () =>
    removed([temporary, ...(await partsOf(temporary))]);
  try {
    const packed = await reader.pack(plan, temporary, options);
    if (packed.kind === 'refused') {
      await leftovers();
      return packed;
    }
    if (plan.test === true) {
      options.onTesting?.();
      const [first = temporary] =
        plan.volumeBytes === undefined ? [] : await partsOf(temporary);
      const { signal, onProgress } = options;
      const tested = await reader.test(first, {
        ...(signal !== undefined && { signal }),
        ...(onProgress !== undefined && { onProgress }),
        ...(plan.password !== undefined &&
          encrypts(plan.format) && { password: plan.password }),
      });
      if (tested.kind === 'refused') {
        await leftovers();
        return {
          kind: 'refused',
          reason: strings.commander.archiveTestFailed(tested.reason),
        };
      }
    }
    await placed(temporary, plan);
    return packed;
  } catch (error) {
    await leftovers();
    throw error;
  } finally {
    writing.delete(temporary);
  }
}

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
