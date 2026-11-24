import { randomUUID } from 'node:crypto';
import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import type {
  ArchiveReader,
  PackOptions,
  PackPlan,
  Packing,
} from './archiveReader';
import { strings } from '../../../lib/shared/strings';
import { encrypts } from '../shared/packing';

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

async function renamedAll(
  moves: readonly (readonly [string, string])[],
): Promise<void> {
  const done: (readonly [string, string])[] = [];
  try {
    for (const [from, to] of moves) {
      await fs.promises.rename(from, to);
      done.push([from, to]);
    }
  } catch (error) {
    for (const [from, to] of done.toReversed()) {
      await fs.promises.rename(to, from).catch(() => undefined);
    }
    throw error;
  }
}

async function placed(temporary: string, plan: PackPlan): Promise<void> {
  if (plan.volumeBytes === undefined) {
    await fs.promises.rename(temporary, plan.archive);
    return;
  }
  const made = await partsOf(temporary);
  const there = new Set(await partsOf(plan.archive));
  const old: string[] = [];
  for (let number = 1; there.has(partName(plan.archive, number)); number++) {
    old.push(partName(plan.archive, number));
  }
  const aside = old.map(
    (part) =>
      [part, `${temporary}.was${part.slice(plan.archive.length)}`] as const,
  );
  await renamedAll(aside);
  try {
    await renamedAll(
      made.map(
        (part) =>
          [part, `${plan.archive}${part.slice(temporary.length)}`] as const,
      ),
    );
  } catch (error) {
    await renamedAll(aside.map(([part, was]) => [was, part] as const)).catch(
      () => undefined,
    );
    throw error;
  }
  await removed(aside.map(([, was]) => was));
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
