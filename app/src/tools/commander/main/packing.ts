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

export async function packInto(
  reader: ArchiveReader,
  plan: PackPlan,
  options: PackOptions = {},
): Promise<Packing> {
  const temporary = `${plan.archive}.${randomUUID().slice(0, 8)}.packing`;
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
  }
}

async function counted(
  file: string,
  totals: { files: number; bytes: number },
): Promise<void> {
  const stats = await fs.promises.lstat(file).catch(() => undefined);
  if (stats === undefined) {
    return;
  }
  if (!stats.isDirectory()) {
    totals.files++;
    totals.bytes += stats.size;
    return;
  }
  const names = await fs.promises.readdir(file).catch(() => []);
  for (const name of names) {
    await counted(path.join(file, name), totals);
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
      const totals = { files: 0, bytes: 0 };
      for (const item of plan.items) {
        await counted(path.join(plan.folder, item), totals);
      }
      if (aborting.signal.aborted) {
        end(true);
        return;
      }
      const { files, bytes } = totals;
      told({
        type: 'progress',
        progress: { files: 0, totalFiles: files, bytes: 0, totalBytes: bytes },
      });
      const packed = await pack(plan, {
        signal: aborting.signal,
        onProgress: ({ percent, files: done, current }) =>
          told({
            type: 'progress',
            progress: {
              files: done,
              totalFiles: files,
              bytes: Math.round((bytes * percent) / 100),
              totalBytes: bytes,
              ...(current !== undefined && { current }),
            },
          }),
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
