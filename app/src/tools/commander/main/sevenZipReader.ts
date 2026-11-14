import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type {
  ArchiveReader,
  ArchiveRefusal,
  ExtractOptions,
  Packing,
  ListedOptions,
  UpdateOptions,
} from './archiveReader';
import {
  listOf,
  packNames,
  passwordGiven,
  sevenZipAt,
  type SevenZip,
} from './sevenZip';
import {
  keptPattern,
  outcomeOf,
  packOutput,
  progressed,
  refusalOf,
  warningOf,
} from './sevenZipOutput';
import { listed } from './sevenZipListing';
import { packed } from './sevenZipPacking';

async function extracted(
  sevenZip: SevenZip,
  file: string,
  paths: readonly string[],
  into: string,
  { signal, onProgress, withoutFolders = false, password }: ExtractOptions = {},
): Promise<ArchiveRefusal | undefined> {
  const names = listOf(paths);
  if (names === undefined) {
    return { reason: strings.commander.lineBreakInName };
  }
  await fs.promises.mkdir(into, { recursive: true });
  const list = `${into}.paths`;
  await fs.promises.writeFile(list, names);
  const { switches, input } = passwordGiven(password);
  try {
    const run = await sevenZip(
      [
        withoutFolders ? 'e' : 'x',
        '-y',
        ...switches,
        '-snz',
        '-spd',
        '-sccUTF-8',
        '-scsUTF-8',
        '-ssc',
        ...(onProgress === undefined ? [] : ['-bso0', '-bsp1']),
        `-o${into}`,
        `-i@${list}`,
        '--',
        file,
      ],
      {
        signal,
        input,
        ...(onProgress !== undefined && { onOutput: progressed(onProgress) }),
      },
    );
    return run.code === 0 || run.code === 1 ? undefined : refusalOf(run, file);
  } finally {
    await fs.promises.rm(list, { force: true });
  }
}

async function removed(
  sevenZip: SevenZip,
  file: string,
  paths: readonly string[],
  { listIn, password, signal, ...told }: ListedOptions,
): Promise<Packing> {
  const names = listOf(paths);
  if (names === undefined) {
    return { kind: 'refused', reason: strings.commander.lineBreakInName };
  }
  const list = path.join(listIn, 'removed.paths');
  await fs.promises.writeFile(list, names);
  const onOutput = packOutput(told, keptPattern);
  const { switches, input } = passwordGiven(password);
  try {
    const run = await sevenZip(
      [
        'd',
        '-y',
        ...switches,
        '-spd',
        '-sccUTF-8',
        '-scsUTF-8',
        '-ssc',
        ...(onOutput === undefined ? [] : ['-bsp1']),
        `-i@${list}`,
        '--',
        file,
      ],
      {
        ...(signal !== undefined && { signal }),
        ...(input !== undefined && { input }),
        ...(onOutput !== undefined && { onOutput }),
      },
    );
    if (run.code === 0) {
      return { kind: 'packed' };
    }
    return run.code === 1
      ? { kind: 'packed', warning: warningOf(run, file) }
      : { kind: 'refused', ...refusalOf(run, file) };
  } finally {
    await fs.promises.rm(list, { force: true });
  }
}

async function renamedIn(
  sevenZip: SevenZip,
  file: string,
  from: string,
  to: string,
  { password, signal, ...told }: UpdateOptions,
): Promise<Packing> {
  const onOutput = packOutput(told, keptPattern);
  const { switches, input } = passwordGiven(password);
  const run = await sevenZip(
    [
      'rn',
      '-y',
      ...switches,
      '-spd',
      '-sccUTF-8',
      '-scsUTF-8',
      '-ssc',
      ...(onOutput === undefined ? [] : ['-bsp1']),
      '--',
      file,
      from,
      to,
    ],
    {
      ...(signal !== undefined && { signal }),
      ...(input !== undefined && { input }),
      ...(onOutput !== undefined && { onOutput }),
    },
  );
  return outcomeOf(run, file);
}

async function addedTo(
  sevenZip: SevenZip,
  file: string,
  folder: string,
  items: readonly string[],
  { listIn, password, signal, ...told }: ListedOptions,
): Promise<Packing> {
  const names = listOf(items);
  if (names === undefined) {
    return { kind: 'refused', reason: strings.commander.lineBreakInName };
  }
  const list = path.join(listIn, 'added.paths');
  await fs.promises.writeFile(list, names);
  const onOutput = packOutput(told);
  try {
    const run = await sevenZip(
      [
        'a',
        '-y',
        ...(password === undefined ? [] : ['-p']),
        ...packNames,
        ...(onOutput === undefined ? [] : ['-bsp1']),
        `-i@${list}`,
        '--',
        file,
      ],
      {
        cwd: folder,
        ...(signal !== undefined && { signal }),
        ...(password !== undefined && {
          input: `${password}\n${password}\n`,
        }),
        ...(onOutput !== undefined && { onOutput }),
      },
    );
    return outcomeOf(run, file);
  } finally {
    await fs.promises.rm(list, { force: true });
  }
}

async function tested(
  sevenZip: SevenZip,
  file: string,
  { password, signal, onProgress }: UpdateOptions,
): Promise<Packing> {
  const { switches, input } = passwordGiven(password);
  const run = await sevenZip(
    [
      't',
      '-y',
      ...switches,
      '-sccUTF-8',
      ...(onProgress === undefined ? [] : ['-bsp1']),
      '--',
      file,
    ],
    {
      ...(signal !== undefined && { signal }),
      ...(input !== undefined && { input }),
      ...(onProgress !== undefined && { onOutput: progressed(onProgress) }),
    },
  );
  return run.code === 0
    ? { kind: 'packed' }
    : { kind: 'refused', ...refusalOf(run, file) };
}

export function sevenZipReaderAt(program: string): ArchiveReader | undefined {
  return fs.existsSync(program)
    ? sevenZipReader(sevenZipAt(program))
    : undefined;
}

export function sevenZipReader(sevenZip: SevenZip): ArchiveReader {
  return {
    list: (file, signal, password) => listed(sevenZip, file, signal, password),
    extract: (file, paths, into, options) =>
      extracted(sevenZip, file, paths, into, options),
    pack: (plan, into, options) => packed(sevenZip, plan, into, options),
    remove: (file, paths, options) => removed(sevenZip, file, paths, options),
    rename: (file, from, to, options) =>
      renamedIn(sevenZip, file, from, to, options),
    add: (file, folder, items, options) =>
      addedTo(sevenZip, file, folder, items, options),
    test: (file, options) => tested(sevenZip, file, options),
  };
}
