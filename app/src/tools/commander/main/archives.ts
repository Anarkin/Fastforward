import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../shared/strings';
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
  readonly reason: string;
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
}

export interface PackOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExtractProgress) => void;
}

export type Packing =
  | { readonly kind: 'packed'; readonly warning?: string }
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
}

interface ArchiveNode {
  readonly entry: Entry;
  readonly path: string;
  readonly encrypted: boolean;
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
      const key = folder === '' ? name : `${folder}/${name}`;
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
}

async function removed(folder: string): Promise<void> {
  await fs.promises
    .rm(folder, { recursive: true, force: true, maxRetries: 3 })
    .catch(() => undefined);
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
      ? this.openedTar(reader, file, source, version, only.path, signal)
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
  ): Promise<Opening> {
    return this.inWorkFolder(async (into) => {
      const refused = await reader.extract(source, [tar], into, { signal });
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
