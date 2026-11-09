import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArchiveReader, PackOptions, PackPlan, Packing } from './archives';
import { reasonOf } from './reasons';
import type { TransferEvent } from './transferProtocol';
import type { ConnectTransfer } from './transfers';

const partNumber = /^\.(\d+)$/;

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
  await removed((await partsOf(plan.archive)).slice(made.length));
}

const temporaryEnding = /^\.[0-9a-f]{8}\.packing(?:\.\d+)?$/;

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
        !writing.has(file.replace(/\.\d+$/, ''))
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
    await placed(temporary, plan);
    return packed;
  } catch (error) {
    await leftovers();
    throw error;
  } finally {
    writing.delete(temporary);
  }
}

export function packing(
  plan: PackPlan,
  pack: (plan: PackPlan, options?: PackOptions) => Promise<Packing>,
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
    const name = path.basename(plan.archive);
    const begin = async () => {
      let totals:
        { readonly files: number; readonly bytes: number } | undefined;
      const packed = await pack(plan, {
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
