import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import { folderKey } from '../shared/paths';
import { removed } from './workFolders';
import type { ArchiveReader, PackOptions, Packing } from './archiveReader';
import type { OpenedArchive } from './archives';

const firstVolume = /\.0{2,}1$/;

export interface ArchiveChangesAccess {
  readonly reader: ArchiveReader | undefined;
  readonly platform: NodeJS.Platform;
  readonly workFolder: () => Promise<string>;
}

export interface ArchiveChangesHost {
  readonly passwordOf: (file: string) => { readonly password?: string };
}

async function linkedTree(from: string, to: string): Promise<void> {
  const stats = await fs.promises.stat(from);
  if (stats.isDirectory()) {
    await fs.promises.mkdir(to);
    for (const name of await fs.promises.readdir(from)) {
      await linkedTree(path.join(from, name), path.join(to, name));
    }
    await fs.promises.utimes(to, stats.atime, stats.mtime);
    return;
  }
  try {
    await fs.promises.link(from, to);
  } catch {
    await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    await fs.promises.utimes(to, stats.atime, stats.mtime);
  }
}

async function temporariesOf(file: string): Promise<string[]> {
  const folder = path.dirname(file);
  const name = `${path.basename(file)}.tmp`;
  const names = await fs.promises.readdir(folder).catch(() => []);
  return names
    .filter((each) => each.startsWith(name))
    .map((each) => path.join(folder, each));
}

export class ArchiveChanges {
  private readonly changing = new Map<string, Promise<unknown>>();

  constructor(
    private readonly access: ArchiveChangesAccess,
    private readonly host: ArchiveChangesHost,
  ) {}

  private keyOf(file: string): string {
    return folderKey(path.resolve(file), this.access.platform);
  }

  remove(
    archive: OpenedArchive,
    paths: readonly string[],
    options: PackOptions = {},
  ): Promise<Packing> {
    return this.updating(archive, (reader, password) =>
      this.listedIn((listIn) =>
        reader.remove(archive.file, paths, { ...options, ...password, listIn }),
      ),
    );
  }

  private async listedIn<T>(run: (listIn: string) => Promise<T>): Promise<T> {
    const listIn = await this.access.workFolder();
    try {
      return await run(listIn);
    } finally {
      await removed(listIn);
    }
  }

  rename(
    archive: OpenedArchive,
    from: string,
    to: string,
    options: PackOptions = {},
  ): Promise<Packing> {
    return this.updating(archive, (reader, password) =>
      reader.rename(archive.file, from, to, { ...options, ...password }),
    );
  }

  addFolder(
    archive: OpenedArchive,
    inner: readonly string[],
    name: string,
    options: PackOptions = {},
  ): Promise<Packing> {
    return this.updating(archive, async (reader, password) => {
      const staged = await this.access.workFolder();
      const made = [...inner, name];
      try {
        await fs.promises.mkdir(path.join(staged, ...made), {
          recursive: true,
        });
        return await this.listedIn((listIn) =>
          reader.add(archive.file, staged, [made.join('/')], {
            ...options,
            ...password,
            listIn,
          }),
        );
      } finally {
        await removed(staged);
      }
    });
  }

  addItems(
    archive: OpenedArchive,
    inner: readonly string[],
    folder: string,
    items: readonly string[],
    options: PackOptions = {},
  ): Promise<Packing> {
    return this.updating(archive, async (reader, password) => {
      const adding = (from: string, names: readonly string[]) =>
        this.listedIn((listIn) =>
          reader.add(archive.file, from, names, {
            ...options,
            ...password,
            listIn,
          }),
        );
      if (
        inner.length === 0 &&
        items.every((item) => path.basename(item) === item)
      ) {
        return adding(folder, items);
      }
      const staged = await this.access.workFolder();
      try {
        const into = path.join(staged, ...inner);
        await fs.promises.mkdir(into, { recursive: true });
        for (const item of items) {
          await linkedTree(
            path.join(folder, item),
            path.join(into, path.basename(item)),
          );
        }
        return await adding(
          staged,
          items.map((item) => [...inner, path.basename(item)].join('/')),
        );
      } finally {
        await removed(staged);
      }
    });
  }

  unchangeable(archive: OpenedArchive): Sentence | undefined {
    const name = path.basename(archive.file);
    if (archive.outer !== undefined || archive.source !== archive.file) {
      return strings.commander.archiveUnchangeable(name);
    }
    return firstVolume.test(archive.file)
      ? strings.commander.archiveInVolumes(name)
      : undefined;
  }

  private updating(
    archive: OpenedArchive,
    run: (
      reader: ArchiveReader,
      password: { readonly password?: string },
    ) => Promise<Packing>,
  ): Promise<Packing> {
    const key = this.keyOf(archive.file);
    const before = this.changing.get(key) ?? Promise.resolve();
    const turn = before.then(() => this.updated(archive, run));
    const ended = turn.catch(() => undefined);
    this.changing.set(key, ended);
    void ended.then(() => {
      if (this.changing.get(key) === ended) {
        this.changing.delete(key);
      }
    });
    return turn;
  }

  private async updated(
    archive: OpenedArchive,
    run: (
      reader: ArchiveReader,
      password: { readonly password?: string },
    ) => Promise<Packing>,
  ): Promise<Packing> {
    const { reader } = this.access;
    if (reader === undefined) {
      return { kind: 'refused', reason: strings.commander.noSevenZip };
    }
    const refusal = this.unchangeable(archive);
    if (refusal !== undefined) {
      return { kind: 'refused', reason: refusal };
    }
    const there = await fs.promises.stat(archive.file).then(
      (stats) => stats.isFile(),
      () => false,
    );
    if (!there) {
      return {
        kind: 'refused',
        reason: strings.commander.archiveGone(path.basename(archive.file)),
      };
    }
    const before = new Set(await temporariesOf(archive.file));
    try {
      return await run(reader, this.host.passwordOf(archive.file));
    } catch (error) {
      for (const left of await temporariesOf(archive.file)) {
        if (!before.has(left)) {
          await removed(left);
        }
      }
      throw error;
    }
  }
}
