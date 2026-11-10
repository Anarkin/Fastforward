import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings, type Sentence } from '../../../shared/strings';
import type { PackFormat, PackLevel, ZipCipher } from '../shared/packing';
import { packInto } from './packing';
import { fileVersion } from '../shared/files';
import { folderKey } from '../shared/paths';
import type { Entry } from '../shared/protocol';

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

export interface RemoveOptions extends UpdateOptions {
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
    options: RemoveOptions,
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
    options: UpdateOptions,
  ): Promise<Packing>;
  test(file: string, options: UpdateOptions): Promise<Packing>;
}

interface ArchiveNode {
  readonly entry: Entry;
  readonly path: string;
  readonly encrypted: boolean;
}

export interface ArchiveBranch {
  readonly path: string;
  readonly parts: readonly string[];
  readonly folder: boolean;
  readonly children: readonly ArchiveBranch[];
}

function childKey(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}

export class ArchiveTree {
  private readonly folders = new Map<string, Map<string, ArchiveNode>>([
    ['', new Map()],
  ]);

  constructor(items: readonly ArchiveItem[], platform: NodeJS.Platform) {
    for (const item of items) {
      const parts = item.path
        .split('/')
        .filter((part) => part !== '' && part !== '.' && part !== '..');
      const name = parts.at(-1);
      if (name === undefined) {
        continue;
      }
      const parent = this.folderOf(parts.slice(0, -1), platform);
      if (item.folder) {
        this.folderOf(parts, platform);
      } else if (parent.get(name)?.entry.folder === true) {
        continue;
      }
      parent.set(name, {
        entry: {
          name,
          folder: item.folder,
          link: item.link,
          hidden:
            platform === 'win32' ? item.hiddenAttribute : name.startsWith('.'),
          size: item.size,
          modified: item.modified,
        },
        path: item.path,
        encrypted: item.encrypted,
      });
    }
    this.sizeFolders();
  }

  private sizeFolders(): void {
    const sizes = new Map<string, number>();
    const sizeOf = (key: string): number => {
      const known = sizes.get(key);
      if (known !== undefined) {
        return known;
      }
      let bytes = 0;
      for (const [name, node] of this.folders.get(key) ?? []) {
        bytes += node.entry.folder
          ? sizeOf(childKey(key, name))
          : (node.entry.size ?? 0);
      }
      sizes.set(key, bytes);
      return bytes;
    };
    for (const [key, folder] of this.folders) {
      for (const [name, node] of folder) {
        if (node.entry.folder) {
          folder.set(name, {
            ...node,
            entry: { ...node.entry, size: sizeOf(childKey(key, name)) },
          });
        }
      }
    }
  }

  private folderOf(
    parts: readonly string[],
    platform: NodeJS.Platform,
  ): Map<string, ArchiveNode> {
    let folder = this.folders.get('') ?? new Map<string, ArchiveNode>();
    for (const [at, name] of parts.entries()) {
      const key = parts.slice(0, at + 1).join('/');
      const inner = this.folders.get(key);
      if (inner !== undefined) {
        folder = inner;
        continue;
      }
      if (folder.get(name)?.entry.folder !== true) {
        folder.set(name, {
          entry: {
            name,
            folder: true,
            link: false,
            hidden: platform !== 'win32' && name.startsWith('.'),
            size: undefined,
            modified: undefined,
          },
          path: key,
          encrypted: false,
        });
      }
      const made = new Map<string, ArchiveNode>();
      this.folders.set(key, made);
      folder = made;
    }
    return folder;
  }

  entries(inner: readonly string[]): readonly Entry[] | undefined {
    const folder = this.folders.get(inner.join('/'));
    return folder && [...folder.values()].map((node) => node.entry);
  }

  totals(
    items: readonly {
      readonly inner: readonly string[];
      readonly name: string;
    }[],
  ): {
    readonly files: number;
    readonly bytes: number;
    readonly encrypted: boolean;
  } {
    let files = 0;
    let bytes = 0;
    let encrypted = false;
    const add = (folder: string, name: string) => {
      const node = this.folders.get(folder)?.get(name);
      if (node === undefined) {
        return;
      }
      if (!node.entry.folder) {
        files++;
        bytes += node.entry.size ?? 0;
        encrypted ||= node.encrypted;
        return;
      }
      const key = childKey(folder, name);
      for (const inside of this.folders.get(key)?.keys() ?? []) {
        add(key, inside);
      }
    };
    for (const { inner, name } of items) {
      add(inner.join('/'), name);
    }
    return { files, bytes, encrypted };
  }

  item(
    inner: readonly string[],
    name: string,
  ): { readonly path: string; readonly encrypted: boolean } | undefined {
    const node = this.folders.get(inner.join('/'))?.get(name);
    return node && { path: node.path, encrypted: node.encrypted };
  }

  branch(inner: readonly string[], name: string): ArchiveBranch | undefined {
    const node = this.folders.get(inner.join('/'))?.get(name);
    if (node === undefined) {
      return undefined;
    }
    const parts = [...inner, name];
    const children = node.entry.folder
      ? [...(this.folders.get(parts.join('/'))?.keys() ?? [])].flatMap(
          (child) => this.branch(parts, child) ?? [],
        )
      : [];
    return { path: node.path, parts, folder: node.entry.folder, children };
  }
}

export interface OpenedArchive {
  readonly file: string;
  readonly version: string;
  readonly source: string;
  readonly tree: ArchiveTree;
  readonly outer?: { readonly file: string; readonly version: string };
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

async function removed(folder: string): Promise<void> {
  await fs.promises
    .rm(folder, { recursive: true, force: true, maxRetries: 3 })
    .catch(() => undefined);
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

const firstVolume = /\.0{2,}1$/;

async function temporariesOf(file: string): Promise<string[]> {
  const folder = path.dirname(file);
  const name = `${path.basename(file)}.tmp`;
  const names = await fs.promises.readdir(folder).catch(() => []);
  return names
    .filter((each) => each.startsWith(name))
    .map((each) => path.join(folder, each));
}

export function workFolders(root: string): {
  readonly next: () => Promise<string>;
  readonly clear: () => Promise<void>;
} {
  return {
    next: async () => {
      await fs.promises.mkdir(root, { recursive: true });
      return fs.promises.mkdtemp(path.join(root, 'work-'));
    },
    clear: () =>
      fs.promises
        .rm(root, { recursive: true, force: true, maxRetries: 3 })
        .catch(() => undefined),
  };
}

const tarName = /\.tar$/i;

export async function filesUnder(folder: string): Promise<string[]> {
  const found = await fs.promises
    .readdir(folder, { recursive: true, withFileTypes: true })
    .catch(() => []);
  return found
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export async function itemsAt(
  folder: string,
  depth: number,
): Promise<string[]> {
  let at = folder;
  for (let level = 0; level < depth; level++) {
    const [only] = await fs.promises.readdir(at).catch(() => []);
    if (only === undefined) {
      return [];
    }
    at = path.join(at, only);
  }
  const found = await fs.promises.readdir(at).catch(() => []);
  return found.map((name) => path.join(at, name));
}

function reasonOfError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Archives implements ArchiveAccess {
  private readonly opened = new Map<string, OpenedArchive>();
  private readonly passwords = new Map<string, string>();
  private readonly changing = new Map<string, Promise<unknown>>();

  constructor(
    private readonly reader: ArchiveReader | undefined,
    private readonly platform: NodeJS.Platform,
    private readonly workFolder: () => Promise<string>,
  ) {}

  private keyOf(file: string): string {
    return folderKey(path.resolve(file), this.platform);
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
      this.opened.delete(key);
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
      this.opened.set(key, opening.archive);
      return opening;
    }
    this.opened.delete(key);
    return opening.needsPassword === true
      ? { ...opening, passwordOf: file }
      : opening;
  }

  async openInside(
    file: string,
    outer: OpenedArchive,
    inside: string,
    signal?: AbortSignal,
  ): Promise<Opening> {
    const { reader } = this;
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
      const refused = await reader.extract(outer.source, [inside], into, {
        signal,
        withoutFolders: true,
        ...this.passwordOf(outer.file),
      });
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
    this.opened.set(key, archive);
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
      }
      return opening;
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
    if (this.reader === undefined) {
      return { kind: 'refused', reason: strings.commander.noSevenZip };
    }
    const folder = into ?? (await this.workFolder());
    const extracting = this.reader.extract(archive.source, paths, folder, {
      ...this.passwordOf(archive.file),
      ...options,
    });
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
    return this.updating(archive, async (reader, password) => {
      const listIn = await this.workFolder();
      try {
        return await reader.remove(archive.file, paths, {
          ...options,
          ...password,
          listIn,
        });
      } finally {
        await removed(listIn);
      }
    });
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
        return await reader.add(archive.file, staged, [made.join('/')], {
          ...options,
          ...password,
        });
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
      const given = { ...options, ...password };
      if (
        inner.length === 0 &&
        items.every((item) => path.basename(item) === item)
      ) {
        return reader.add(archive.file, folder, items, given);
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
        return await reader.add(
          archive.file,
          staged,
          items.map((item) => [...inner, path.basename(item)].join('/')),
          given,
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
