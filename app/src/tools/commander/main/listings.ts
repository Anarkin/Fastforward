import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { strings } from '../../../lib/shared/strings';
import { type Page, type ShellAccess } from '../../../shell/main/shell';
import { SavedSides } from './savedSides';
import {
  type CommanderToHost,
  type Entry,
  type Side,
} from '../shared/protocol';
import type { LocalFileSystem } from './fileSystem';
import { pathParts } from '../shared/paths';
import type { ElevatedFileSystem } from './elevated';
import { codeOf, reasonOf } from './reasons';
import { repositoriesIn } from './repositories';
import {
  type Pane,
  Sides,
  post,
  type Listing,
  sizedEntry,
  parentOf,
} from './sides';
import { SideScans } from './sideScans';
import { ArchiveCopies } from './archiveCopies';
import type { CommanderAccess } from './commanderAccess';
import { isFile, isFolder } from './fileStats';
import { shownBookmarks, type BookmarkSystem } from './bookmarks';
import { typedPath } from './typedPaths';
import { ReadingStopped, type Opener, ArchiveListing } from './archiveListing';

const maxHistory = 100;
export function childToward(folder: string, from: string): string | undefined {
  const relative = path.relative(folder, from);
  return relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep)[0];
}

export function rootFolder(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  return platform === 'win32' ? `${env.SystemDrive ?? 'C:'}\\` : '/';
}

function isGone(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isDenied(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'EACCES' || code === 'EPERM';
}

class RefusedAsAdministrator extends Error {
  readonly code: unknown;

  constructor(refused: unknown) {
    super(refused instanceof Error ? refused.message : String(refused));
    this.code = codeOf(refused);
  }
}

function entriesShown({ entries = [], sizing }: Pane): readonly Entry[] {
  return sizing === undefined
    ? entries
    : entries.map((entry) =>
        entry.folder ? sizedEntry(entry, sizing.sizes.of(entry.name)) : entry,
      );
}

export interface ListingParts {
  readonly archiveListing: ArchiveListing;
  readonly scans: SideScans;
  readonly copies: ArchiveCopies;
  readonly savedSides: SavedSides;
}

export interface ListingsHost {
  readonly shell: () => ShellAccess;
  readonly elevated: () => ElevatedFileSystem | undefined;
  readonly files: () => Promise<LocalFileSystem>;
  readonly saveQuietly: (saving: Promise<void>) => void;
}

export class Listings {
  constructor(
    private readonly access: CommanderAccess,
    private readonly sides: Sides,
    private readonly parts: ListingParts,
    private readonly host: ListingsHost,
  ) {}

  async listed(
    folder: string,
    opener?: Opener,
  ): Promise<{
    readonly entries: readonly Entry[];
    readonly elevated: boolean;
    readonly archive?: string;
  }> {
    const inside = this.access.archives?.within(folder);
    if (inside !== undefined) {
      return this.parts.archiveListing.archiveListed(
        inside.archive.file,
        folder,
        undefined,
        opener,
      );
    }
    const files = await this.host.files();
    const elevated = this.host.elevated();
    try {
      return { entries: await files.list(folder), elevated: false };
    } catch (error) {
      const holding = isGone(error)
        ? await this.access.archives?.fileHolding(folder)
        : undefined;
      if (holding !== undefined) {
        return this.parts.archiveListing.archiveListed(
          holding,
          folder,
          error,
          opener,
        );
      }
      if (!isDenied(error) || elevated === undefined) {
        throw error;
      }
    }
    try {
      return { entries: await elevated.list(folder), elevated: true };
    } catch (error) {
      throw isDenied(error) ? new RefusedAsAdministrator(error) : error;
    }
  }

  private async findRepositories(
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    again: boolean,
  ): Promise<void> {
    const asked = ++pane.repositoriesAsked;
    const { folder } = pane;
    const folders = new Map(
      (pane.entries ?? [])
        .filter((entry) => entry.folder)
        .map((entry) => [entry.name, entry.modified]),
    );
    const looked =
      again && pane.looked?.folder === folder ? pane.looked.folders : undefined;
    const unchanged = (name: string) =>
      looked?.has(name) === true && looked.get(name) === folders.get(name);
    const kept = [...pane.repositories].filter(
      (name) => folders.has(name) && unchanged(name),
    );
    const [names, inside] = await Promise.all([
      repositoriesIn(
        folder,
        [...folders.keys()].filter((name) => !unchanged(name)),
        this.access.isRepository,
        () => pane.repositoriesAsked === asked,
      ),
      this.inRepository(folder),
    ]);
    if (pane.repositoriesAsked !== asked) {
      return;
    }
    pane.looked = { folder, folders };
    const found = new Set([...kept, ...names]);
    pane.repositories = found;
    if (this.sides.shown.get(page)?.tab === tab) {
      post(page, {
        type: 'repositories',
        tab,
        side,
        folder,
        names: [...folders.keys()].filter((name) => found.has(name)),
        ...(inside && { inRepository: true }),
      });
    }
  }

  private async inRepository(folder: string): Promise<boolean> {
    return (
      (await this.access.inRepository?.(folder).catch(() => false)) ?? false
    );
  }

  async list(
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    how: Listing,
    fallback?: string,
    selecting?: string,
  ): Promise<void> {
    const pane = this.sides.panes.get(tab)?.[side];
    if (pane === undefined) {
      return;
    }
    if (
      pane.flat !== undefined &&
      pane.folder === folder &&
      (how === 'show' || how === 'refresh')
    ) {
      this.postListing(page, tab, side, pane, undefined);
      this.parts.scans.flushFlat(tab, side, pane.flat);
      this.parts.scans.flushDuplicates(tab, side, pane.duplicates);
      return;
    }
    if (how === 'refresh' && pane.reading !== undefined) {
      await pane.reading;
      if (pane.folder !== folder) {
        return;
      }
    }
    const asked = how === 'refresh' ? pane.asked : ++pane.asked;
    const stamp = await this.access.stamp?.(folder);
    let listing: Awaited<ReturnType<Listings['listed']>>;
    try {
      listing = await this.listed(folder, (file) =>
        this.parts.archiveListing.openFor(page, tab, side, file),
      );
    } catch (error) {
      if (error instanceof ReadingStopped) {
        if (pane.asked === asked && pane.folder === folder) {
          await this.list(
            page,
            tab,
            side,
            path.dirname(error.file),
            'show',
            undefined,
            path.basename(error.file),
          );
        }
        return;
      }
      if (
        pane.asked !== asked ||
        (how === 'refresh' && pane.landed !== asked)
      ) {
        return;
      }
      const nearest =
        (how === 'refresh' || how === 'show') && isGone(error)
          ? await this.nearestFolder(folder)
          : folder;
      if (nearest !== folder) {
        await this.list(page, tab, side, nearest, 'show');
        return;
      }
      if (how !== 'refresh') {
        if (isDenied(error) && fallback !== undefined) {
          await this.list(page, tab, side, fallback, how);
          return;
        }
        if (isDenied(error)) {
          pane.denied = folder;
          post(page, {
            type: 'noAccess',
            side,
            folder,
            asAdministrator:
              this.access.elevate !== undefined &&
              !(error instanceof RefusedAsAdministrator),
          });
        } else {
          this.host.shell().notice(page, {
            level: 'error',
            message: strings.commander.couldNotOpen(folder, reasonOf(error)),
          });
        }
        pane.landed = asked;
        this.postListing(page, tab, side, pane, undefined);
      }
      return;
    }
    const [hidden, binOff] = await Promise.all([
      this.hiddenParts(folder),
      listing.archive === undefined ? this.binOff(folder) : false,
    ]);
    if (pane.asked !== asked || (how === 'refresh' && pane.folder !== folder)) {
      return;
    }
    const listedAsBefore =
      how === 'refresh' &&
      pane.folder === folder &&
      pane.landed === asked &&
      pane.denied !== folder &&
      pane.elevated === listing.elevated &&
      pane.archive === listing.archive &&
      pane.binOff === binOff &&
      isDeepStrictEqual(pane.hidden, hidden) &&
      isDeepStrictEqual(pane.entries, listing.entries);
    const selected = selecting ?? childToward(folder, pane.folder);
    if (typeof how === 'object') {
      pane.at = how.at;
    } else if (how === 'visit' && pane.history[pane.at] !== folder) {
      const history = [...pane.history.slice(0, pane.at + 1), folder].slice(
        -maxHistory,
      );
      pane.history = history;
      pane.at = history.length - 1;
    }
    if (pane.folder !== folder) {
      pane.repositories = new Set();
      this.parts.scans.endFlat(pane);
      this.parts.scans.endSizing(pane);
      this.parts.scans.endDuplicates(pane);
    }
    if (how === 'visit' || typeof how === 'object' || pane.denied === folder) {
      pane.denied = undefined;
    }
    if (pane.folder !== folder && !listing.elevated) {
      this.host.saveQuietly(this.parts.savedSides.save(tab, side, folder));
    }
    const left = pane.folder !== folder;
    pane.folder = folder;
    if (left) {
      this.parts.copies.letGoOfCopies();
    }
    pane.hidden = hidden;
    pane.entries = listing.entries;
    pane.elevated = listing.elevated;
    pane.archive = listing.archive;
    pane.binOff = binOff;
    pane.landed = asked;
    if (!listedAsBefore) {
      this.postListing(page, tab, side, pane, selected);
    }
    this.parts.scans.feedDuplicates(pane);
    this.watch(page, tab, side, folder, stamp);
    if (listing.archive === undefined) {
      void this.host
        .shell()
        .track(this.findRepositories(page, tab, side, pane, how === 'refresh'));
    }
  }

  private async nearestFolder(gone: string): Promise<string> {
    for (
      let folder = parentOf(gone);
      folder !== undefined;
      folder = parentOf(folder)
    ) {
      if (
        (await isFolder(folder)) ||
        (await this.parts.archiveListing.isArchiveFolder(folder))
      ) {
        return folder;
      }
    }
    return this.access.root;
  }

  private watch(
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    listed: string | undefined,
  ): void {
    const showing = this.sides.shown.get(page);
    if (showing?.tab !== tab) {
      return;
    }
    const pane = this.sides.panes.get(tab)?.[side];
    const elevated = pane?.elevated === true ? this.host.elevated() : undefined;
    const archive = pane?.archive;
    const current = showing.watching.get(side);
    if (
      current?.folder === folder &&
      current.elevated === (elevated !== undefined)
    ) {
      return;
    }
    current?.stop();
    const watch = elevated?.watch ?? this.access.watch;
    let listing = false;
    let changedMeanwhile = false;
    const refresh = (): void => {
      if (listing) {
        changedMeanwhile = true;
        return;
      }
      listing = true;
      void this.list(page, tab, side, folder, 'refresh').finally(() => {
        listing = false;
        if (changedMeanwhile) {
          changedMeanwhile = false;
          refresh();
        }
      });
    };
    showing.watching.set(side, {
      folder,
      elevated: elevated !== undefined,
      stop:
        archive === undefined
          ? watch(folder, refresh, listed)
          : watch(archive, refresh),
    });
  }

  postListing(
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    selected: string | undefined,
  ): void {
    if (this.sides.shown.get(page)?.tab === tab) {
      post(page, {
        type: 'listing',
        tab,
        side,
        folder: pane.folder,
        hidden: pane.hidden ?? [],
        entries: pane.flat === undefined ? entriesShown(pane) : [],
        parent: parentOf(pane.folder) !== undefined,
        elevated: pane.elevated === true,
        ...(pane.binOff === true && { binOff: true }),
        ...(pane.archive !== undefined && { archive: pane.archive }),
        back: pane.at > 0,
        forward: pane.at < pane.history.length - 1,
        selected,
        ...(pane.flat !== undefined && { flat: pane.flat.walk }),
        ...(pane.duplicates !== undefined && {
          duplicates: pane.duplicates.look,
        }),
      });
    }
  }

  async hiddenParts(file: string): Promise<readonly boolean[]> {
    const files = await this.host.files();
    return Promise.all(pathParts(file).map((part) => files.hidden(part.path)));
  }

  private async binOff(folder: string): Promise<boolean> {
    try {
      return (await this.access.binOff?.(folder)) === true;
    } catch {
      return false;
    }
  }

  private get bookmarkSystem(): BookmarkSystem {
    return { paths: path, platform: this.access.platform };
  }

  step(page: Page, tab: unknown, side: unknown, step: unknown): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    if (shown === undefined || (step !== -1 && step !== 1)) {
      return Promise.resolve();
    }
    const at = shown.pane.at + step;
    const folder = shown.pane.history.at(at);
    return at < 0 || folder === undefined
      ? Promise.resolve()
      : this.list(page, shown.tab, shown.side, folder, { at });
  }

  async goToBookmark(
    page: Page,
    { tab, side, folder }: Extract<CommanderToHost, { type: 'goToBookmark' }>,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    const bookmarked = shownBookmarks(
      this.access.settings().bookmarks,
      this.bookmarkSystem,
    ).find((bookmark) => bookmark === folder);
    if (shown !== undefined && bookmarked !== undefined) {
      await this.list(page, shown.tab, shown.side, bookmarked, 'visit');
    }
  }

  async goTo(
    page: Page,
    { tab, side, folder, to }: Extract<CommanderToHost, { type: 'goTo' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const { home, variable, knownFolder } = this.access;
    const target =
      shown === undefined || typeof to !== 'string'
        ? undefined
        : await typedPath(to, shown.pane.folder, {
            ...this.bookmarkSystem,
            home,
            variable: variable ?? (() => undefined),
            knownFolder,
          });
    if (shown === undefined || target === undefined) {
      return;
    }
    if (await isFile(target)) {
      await this.list(
        page,
        shown.tab,
        shown.side,
        path.dirname(target),
        'visit',
        undefined,
        path.basename(target),
      );
      return;
    }
    await this.list(page, shown.tab, shown.side, target, 'visit');
  }

  async drive(
    page: Page,
    tab: unknown,
    side: unknown,
    drive: unknown,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    if (shown === undefined) {
      return;
    }
    const drives = await (await this.host.files()).drives();
    const chosen = drives.find((each) => each === drive);
    if (chosen !== undefined) {
      await this.list(page, shown.tab, shown.side, chosen, 'visit');
    }
  }
}
