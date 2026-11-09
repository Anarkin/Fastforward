import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../shared/strings';
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

export type ArchiveListing =
  | { readonly kind: 'listed'; readonly items: readonly ArchiveItem[] }
  | { readonly kind: 'refused'; readonly reason: string };

export interface ExtractProgress {
  readonly percent: number;
  readonly files: number;
  readonly current?: string;
}

export interface ArchiveReader {
  list(file: string, signal?: AbortSignal): Promise<ArchiveListing>;
  extract(
    file: string,
    paths: readonly string[],
    into: string,
    signal?: AbortSignal,
    onProgress?: (progress: ExtractProgress) => void,
  ): Promise<string | undefined>;
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
    inner: readonly string[],
    names: readonly string[],
  ): { readonly files: number; readonly bytes: number } {
    let files = 0;
    let bytes = 0;
    const add = (folder: string, name: string) => {
      const node = this.folders.get(folder)?.get(name);
      if (node === undefined) {
        return;
      }
      if (!node.entry.folder) {
        files++;
        bytes += node.entry.size ?? 0;
        return;
      }
      const key = folder === '' ? name : `${folder}/${name}`;
      for (const inside of this.folders.get(key)?.keys() ?? []) {
        add(key, inside);
      }
    };
    for (const name of names) {
      add(inner.join('/'), name);
    }
    return { files, bytes };
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
}

export type Opening =
  | { readonly kind: 'opened'; readonly archive: OpenedArchive }
  | { readonly kind: 'refused'; readonly reason: string };

export type Extracting =
  | { readonly kind: 'extracted'; readonly folder: string }
  | { readonly kind: 'refused'; readonly reason: string };

export interface ArchiveAccess {
  open(file: string, signal?: AbortSignal): Promise<Opening>;
  extract(
    archive: OpenedArchive,
    paths: readonly string[],
    into?: string,
    signal?: AbortSignal,
    onProgress?: (progress: ExtractProgress) => void,
  ): Promise<Extracting>;
  within(
    folder: string,
  ): { readonly archive: OpenedArchive; readonly inner: string[] } | undefined;
  fileHolding(folder: string): Promise<string | undefined>;
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
      return { kind: 'refused', reason: strings.commander.noSevenZip };
    }
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(file);
    } catch (error) {
      return { kind: 'refused', reason: reasonOfError(error) };
    }
    if (!stats.isFile()) {
      return { kind: 'refused', reason: strings.commander.notAFile };
    }
    const version = fileVersion(stats);
    const key = this.keyOf(file);
    const known = this.opened.get(key);
    if (known?.version === version) {
      return { kind: 'opened', archive: known };
    }
    const listing = await reader.list(file, signal);
    if (listing.kind === 'refused') {
      this.opened.delete(key);
      return listing;
    }
    const [only, ...more] = listing.items;
    const opening =
      only !== undefined &&
      more.length === 0 &&
      !only.folder &&
      tarName.test(only.path)
        ? await this.openedTar(reader, file, version, only.path, signal)
        : ({
            kind: 'opened',
            archive: {
              file,
              version,
              source: file,
              tree: new ArchiveTree(listing.items, this.platform),
            },
          } as const);
    if (opening.kind === 'opened') {
      this.opened.set(key, opening.archive);
    }
    return opening;
  }

  private async openedTar(
    reader: ArchiveReader,
    file: string,
    version: string,
    tar: string,
    signal: AbortSignal | undefined,
  ): Promise<Opening> {
    const into = await this.workFolder();
    const refused = await reader.extract(file, [tar], into, signal);
    const [unpacked] = await filesUnder(into);
    if (refused !== undefined || unpacked === undefined) {
      return {
        kind: 'refused',
        reason: refused ?? strings.commander.sevenZipEnded(null),
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
  }

  async extract(
    archive: OpenedArchive,
    paths: readonly string[],
    into?: string,
    signal?: AbortSignal,
    onProgress?: (progress: ExtractProgress) => void,
  ): Promise<Extracting> {
    if (this.reader === undefined) {
      return { kind: 'refused', reason: strings.commander.noSevenZip };
    }
    const folder = into ?? (await this.workFolder());
    const refused = await this.reader.extract(
      archive.source,
      paths,
      folder,
      signal,
      onProgress,
    );
    return refused === undefined
      ? { kind: 'extracted', folder }
      : { kind: 'refused', reason: refused };
  }

  within(
    folder: string,
  ): { readonly archive: OpenedArchive; readonly inner: string[] } | undefined {
    const key = this.keyOf(folder);
    for (const [file, archive] of this.opened) {
      if (key === file || key.startsWith(`${file}${path.sep}`)) {
        const inner = path
          .relative(path.resolve(archive.file), path.resolve(folder))
          .split(path.sep)
          .filter((part) => part !== '');
        return { archive, inner };
      }
    }
    return undefined;
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
