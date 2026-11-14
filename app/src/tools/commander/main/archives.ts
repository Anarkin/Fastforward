import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings, type Sentence } from '../../../lib/shared/strings';
import type { PackFormat, PackLevel, ZipCipher } from '../shared/packing';
import { packInto } from './packing';
import { fileVersion } from '../shared/files';
import { folderKey } from '../shared/paths';

import { ArchiveTree } from './archiveTree';
import {
  removed,
  linkedTree,
  firstVolume,
  temporariesOf,
  tarName,
  filesUnder,
} from './archiveFiles';
export interface ArchiveItem {
  readonly path: string;
  readonly folder: boolean;
  readonly size: number | undefined;
  readonly modified: number | undefined;
  readonly hiddenAttribute: boolean;
  readonly link: boolean;
  readonly encrypted: boolean;
}

export interface ArchiveRefusal {
  readonly reason: Sentence;
  readonly noArchive?: true;
  readonly needsPassword?: true;
}

type Refused = {
  readonly kind: 'refused';
  readonly passwordOf?: string;
} & ArchiveRefusal;

export type ArchiveListing =
  { readonly kind: 'listed'; readonly items: readonly ArchiveItem[] } | Refused;

export interface ExtractProgress {
  readonly percent: number;
  readonly files: number;
  readonly current?: string;
}

export interface ExtractOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExtractProgress) => void;
  readonly withoutFolders?: boolean;
  readonly password?: string;
}

export interface PackPlan {
  readonly folder: string;
  readonly items: readonly string[];
  readonly archive: string;
  readonly format: PackFormat;
  readonly level: PackLevel;
  readonly password?: string;
  readonly encryptNames?: boolean;
  readonly zipCipher?: ZipCipher;
  readonly volumeBytes?: number;
  readonly test?: boolean;
}

export interface PackOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExtractProgress) => void;
  readonly onTotals?: (totals: {
    readonly files: number;
    readonly bytes: number;
  }) => void;
  readonly onTesting?: () => void;
}

export interface UpdateOptions extends PackOptions {
  readonly password?: string;
}

export interface ListedOptions extends UpdateOptions {
  readonly listIn: string;
}

export type Packing =
  | { readonly kind: 'packed'; readonly warning?: Sentence }
  | ({ readonly kind: 'refused' } & ArchiveRefusal);

export interface ArchiveReader {
  list(
    file: string,
    signal?: AbortSignal,
    password?: string,
  ): Promise<ArchiveListing>;
  extract(
    file: string,
    paths: readonly string[],
    into: string,
    options?: ExtractOptions,
  ): Promise<ArchiveRefusal | undefined>;
  pack(plan: PackPlan, into: string, options?: PackOptions): Promise<Packing>;
  remove(
    file: string,
    paths: readonly string[],
    options: ListedOptions,
  ): Promise<Packing>;
  rename(
    file: string,
    from: string,
    to: string,
    options: UpdateOptions,
  ): Promise<Packing>;
  add(
    file: string,
    folder: string,
    items: readonly string[],
    options: ListedOptions,
  ): Promise<Packing>;
  test(file: string, options: UpdateOptions): Promise<Packing>;
}

export interface OpenedArchive {
  readonly file: string;
  readonly version: string;
  readonly source: string;
  readonly tree: ArchiveTree;
  readonly outer?: { readonly file: string; readonly version: string };
  readonly work?: readonly string[];
}

export type Opening =
  { readonly kind: 'opened'; readonly archive: OpenedArchive } | Refused;

export type Extracting =
  { readonly kind: 'extracted'; readonly folder: string } | Refused;

export interface ArchiveAccess {
  open(file: string, signal?: AbortSignal): Promise<Opening>;
  unchangeable(archive: OpenedArchive): Sentence | undefined;
  openInside(
    file: string,
    outer: OpenedArchive,
    path: string,
    signal?: AbortSignal,
  ): Promise<Opening>;
  extract(
    archive: OpenedArchive,
    paths: readonly string[],
    options?: ExtractOptions & { readonly into?: string },
  ): Promise<Extracting>;
  within(
    folder: string,
  ): { readonly archive: OpenedArchive; readonly inner: string[] } | undefined;
  fileHolding(folder: string): Promise<string | undefined>;
  usePassword(file: string, password: string | undefined): void;
  hasPassword(file: string): boolean;
  pack(plan: PackPlan, options?: PackOptions): Promise<Packing>;
  remove(
    archive: OpenedArchive,
    paths: readonly string[],
    options?: PackOptions,
  ): Promise<Packing>;
  rename(
    archive: OpenedArchive,
    from: string,
    to: string,
    options?: PackOptions,
  ): Promise<Packing>;
  addFolder(
    archive: OpenedArchive,
    inner: readonly string[],
    name: string,
    options?: PackOptions,
  ): Promise<Packing>;
  addItems(
    archive: OpenedArchive,
    inner: readonly string[],
    folder: string,
    items: readonly string[],
    options?: PackOptions,
  ): Promise<Packing>;
  test(file: string, options?: PackOptions): Promise<Packing>;
}

function reasonOfError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Archives implements ArchiveAccess {
  private readonly opened = new Map<string, OpenedArchive>();
  private readonly passwords = new Map<string, string>();
  private readonly changing = new Map<string, Promise<unknown>>();
  private readonly reading = new Map<OpenedArchive, number>();
  private readonly retired = new WeakSet<OpenedArchive>();

  constructor(
    private readonly reader: ArchiveReader | undefined,
    private readonly platform: NodeJS.Platform,
    private readonly workFolder: () => Promise<string>,
  ) {}

  private keyOf(file: string): string {
    return folderKey(path.resolve(file), this.platform);
  }

  private async replaced(
    key: string,
    archive: OpenedArchive | undefined,
  ): Promise<void> {
    const before = this.opened.get(key);
    if (archive === undefined) {
      this.opened.delete(key);
    } else {
      this.opened.set(key, archive);
    }
    if (before === undefined || before === archive) {
      return;
    }
    this.retired.add(before);
    if (!this.reading.has(before)) {
      await this.removedWork(before);
    }
  }

  private async removedWork(archive: OpenedArchive): Promise<void> {
    await Promise.all((archive.work ?? []).map((each) => removed(each)));
  }

  private latest(archive: OpenedArchive): OpenedArchive {
    return this.retired.has(archive)
      ? (this.opened.get(this.keyOf(archive.file)) ?? archive)
      : archive;
  }

  private async readFrom<T>(
    archive: OpenedArchive,
    read: () => Promise<T>,
  ): Promise<T> {
    this.reading.set(archive, (this.reading.get(archive) ?? 0) + 1);
    try {
      return await read();
    } finally {
      const left = (this.reading.get(archive) ?? 1) - 1;
      if (left > 0) {
        this.reading.set(archive, left);
      } else {
        this.reading.delete(archive);
        if (this.retired.has(archive)) {
          await this.removedWork(archive);
        }
      }
    }
  }

  async open(file: string, signal?: AbortSignal): Promise<Opening> {
    const { reader } = this;
    if (reader === undefined) {
      return {
        kind: 'refused',
        reason: strings.commander.noSevenZip,
        noArchive: true,
      };
    }
    const key = this.keyOf(file);
    const known = this.opened.get(key);
    if (known?.outer !== undefined) {
      const outer = await this.open(known.outer.file, signal);
      if (
        outer.kind === 'opened' &&
        outer.archive.version === known.outer.version
      ) {
        return { kind: 'opened', archive: known };
      }
      await this.replaced(key, undefined);
      return {
        kind: 'refused',
        reason: strings.commander.notAFile,
        noArchive: true,
      };
    }
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(file);
    } catch (error) {
      return { kind: 'refused', reason: reasonOfError(error), noArchive: true };
    }
    if (!stats.isFile()) {
      return {
        kind: 'refused',
        reason: strings.commander.notAFile,
        noArchive: true,
      };
    }
    const version = fileVersion(stats);
    if (known?.version === version) {
      return { kind: 'opened', archive: known };
    }
    const opening = await this.openedFrom(
      reader,
      file,
      file,
      version,
      signal,
      this.passwords.get(key),
    );
    if (opening.kind === 'opened') {
      await this.replaced(key, opening.archive);
      return opening;
    }
    await this.replaced(key, undefined);
    return opening.needsPassword === true
      ? { ...opening, passwordOf: file }
      : opening;
  }

  async openInside(
    file: string,
    given: OpenedArchive,
    inside: string,
    signal?: AbortSignal,
  ): Promise<Opening> {
    const { reader } = this;
    const outer = this.latest(given);
    const key = this.keyOf(file);
    const known = this.opened.get(key);
    if (known?.outer?.version === outer.version) {
      return { kind: 'opened', archive: known };
    }
    if (reader === undefined) {
      return {
        kind: 'refused',
        reason: strings.commander.noSevenZip,
        noArchive: true,
      };
    }
    const opening = await this.inWorkFolder(async (into) => {
      const refused = await this.readFrom(outer, () =>
        reader.extract(outer.source, [inside], into, {
          signal,
          withoutFolders: true,
          ...this.passwordOf(outer.file),
        }),
      );
      const [copy] = await filesUnder(into);
      if (refused !== undefined || copy === undefined) {
        return {
          kind: 'refused',
          ...(refused ?? { reason: strings.commander.sevenZipEnded(null) }),
          ...(refused?.needsPassword === true && { passwordOf: outer.file }),
        };
      }
      return this.openedFrom(
        reader,
        file,
        copy,
        outer.version,
        signal,
        this.passwords.get(key),
      );
    });
    if (opening.kind !== 'opened') {
      return opening.needsPassword === true && opening.passwordOf === undefined
        ? { ...opening, passwordOf: file }
        : opening;
    }
    const archive = {
      ...opening.archive,
      outer: { file: outer.file, version: outer.version },
    };
    await this.replaced(key, archive);
    return { kind: 'opened', archive };
  }

  private async openedFrom(
    reader: ArchiveReader,
    file: string,
    source: string,
    version: string,
    signal: AbortSignal | undefined,
    password: string | undefined,
  ): Promise<Opening> {
    const listing = await reader.list(source, signal, password);
    if (listing.kind === 'refused') {
      return listing;
    }
    const [only, ...more] = listing.items;
    return only !== undefined &&
      more.length === 0 &&
      !only.folder &&
      tarName.test(only.path)
      ? this.openedTar(
          reader,
          file,
          source,
          version,
          only.path,
          signal,
          password,
        )
      : {
          kind: 'opened',
          archive: {
            file,
            version,
            source,
            tree: new ArchiveTree(listing.items, this.platform),
          },
        };
  }

  private async openedTar(
    reader: ArchiveReader,
    file: string,
    source: string,
    version: string,
    tar: string,
    signal: AbortSignal | undefined,
    password: string | undefined,
  ): Promise<Opening> {
    return this.inWorkFolder(async (into) => {
      const refused = await reader.extract(source, [tar], into, {
        signal,
        ...(password !== undefined && { password }),
      });
      const [unpacked] = await filesUnder(into);
      if (refused !== undefined || unpacked === undefined) {
        return {
          kind: 'refused',
          ...(refused ?? { reason: strings.commander.sevenZipEnded(null) }),
        };
      }
      const listing = await reader.list(unpacked, signal);
      return listing.kind === 'refused'
        ? listing
        : {
            kind: 'opened',
            archive: {
              file,
              version,
              source: unpacked,
              tree: new ArchiveTree(listing.items, this.platform),
            },
          };
    });
  }

  private async inWorkFolder(
    open: (into: string) => Promise<Opening>,
  ): Promise<Opening> {
    const into = await this.workFolder();
    try {
      const opening = await open(into);
      if (opening.kind !== 'opened') {
        await removed(into);
        return opening;
      }
      return {
        kind: 'opened',
        archive: {
          ...opening.archive,
          work: [...(opening.archive.work ?? []), into],
        },
      };
    } catch (error) {
      await removed(into);
      throw error;
    }
  }

  async extract(
    archive: OpenedArchive,
    paths: readonly string[],
    { into, ...options }: ExtractOptions & { readonly into?: string } = {},
  ): Promise<Extracting> {
    const { reader } = this;
    if (reader === undefined) {
      return { kind: 'refused', reason: strings.commander.noSevenZip };
    }
    const folder = into ?? (await this.workFolder());
    const from = this.latest(archive);
    const extracting = this.readFrom(from, () =>
      reader.extract(from.source, paths, folder, {
        ...this.passwordOf(from.file),
        ...options,
      }),
    );
    const refused =
      into === undefined
        ? await extracting.catch(async (error: unknown) => {
            await removed(folder);
            throw error;
          })
        : await extracting;
    if (refused === undefined) {
      return { kind: 'extracted', folder };
    }
    if (into === undefined) {
      await removed(folder);
    }
    return { kind: 'refused', ...refused };
  }

  async pack(plan: PackPlan, options?: PackOptions): Promise<Packing> {
    return this.reader === undefined
      ? { kind: 'refused', reason: strings.commander.noSevenZip }
      : packInto(this.reader, plan, options);
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
    const listIn = await this.workFolder();
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
      const staged = await this.workFolder();
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
      const staged = await this.workFolder();
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

  async test(file: string, options: PackOptions = {}): Promise<Packing> {
    return this.reader === undefined
      ? { kind: 'refused', reason: strings.commander.noSevenZip }
      : this.reader.test(file, { ...options, ...this.passwordOf(file) });
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
    const { reader } = this;
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
      return await run(reader, this.passwordOf(archive.file));
    } catch (error) {
      for (const left of await temporariesOf(archive.file)) {
        if (!before.has(left)) {
          await removed(left);
        }
      }
      throw error;
    }
  }

  usePassword(file: string, password: string | undefined): void {
    const key = this.keyOf(file);
    if (password === undefined) {
      this.passwords.delete(key);
    } else {
      this.passwords.set(key, password);
    }
  }

  hasPassword(file: string): boolean {
    return this.passwords.has(this.keyOf(file));
  }

  private passwordOf(file: string): { readonly password?: string } {
    const password = this.passwords.get(this.keyOf(file));
    return password === undefined ? {} : { password };
  }

  within(
    folder: string,
  ): { readonly archive: OpenedArchive; readonly inner: string[] } | undefined {
    const key = this.keyOf(folder);
    const [innermost] = [...this.opened]
      .filter(([file]) => key === file || key.startsWith(`${file}${path.sep}`))
      .toSorted(([one], [other]) => other.length - one.length);
    if (innermost === undefined) {
      return undefined;
    }
    const [, archive] = innermost;
    const inner = path
      .relative(path.resolve(archive.file), path.resolve(folder))
      .split(path.sep)
      .filter((part) => part !== '');
    return { archive, inner };
  }

  async fileHolding(folder: string): Promise<string | undefined> {
    for (
      let at = path.resolve(folder);
      path.dirname(at) !== at;
      at = path.dirname(at)
    ) {
      const stats = await fs.promises.stat(at).catch(() => undefined);
      if (stats?.isFile() === true) {
        return at;
      }
      if (stats?.isDirectory() === true) {
        return undefined;
      }
    }
    return undefined;
  }
}
