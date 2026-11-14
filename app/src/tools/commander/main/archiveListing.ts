import * as path from 'node:path';
import { plainOf, strings, type Sentence } from '../../../lib/shared/strings';
import type { Page } from '../../../shell/main/shell';
import {
  isSide,
  parentFolder,
  type CommanderToHost,
  type Entry,
  type Side,
} from '../shared/protocol';
import type { OpenedArchive, Opening } from './archives';
import { type Pane, type Sides, post, type Listing, listedIn } from './sides';
import type { ArchiveCopies } from './archiveCopies';
import type { CommanderAccess } from './commanderAccess';
import { isFile } from './fileStats';

export type ArchiveListingAccess = Pick<CommanderAccess, 'archives'>;

export interface ArchiveListingHost {
  readonly refuse: (page: Page, message: Sentence) => void;
  readonly list: (
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    how: Listing,
    fallback?: string,
    selecting?: string,
  ) => Promise<void>;
}

const readingToldAfter = 300;

export class ReadingStopped extends Error {
  constructor(readonly file: string) {
    super(file);
  }
}

export type Opener = (file: string) => Promise<Opening | undefined>;

export class ArchiveListing {
  constructor(
    private readonly access: ArchiveListingAccess,
    private readonly sides: Sides,
    private readonly copies: ArchiveCopies,
    private readonly host: ArchiveListingHost,
  ) {}

  async archiveListed(
    file: string,
    folder: string,
    unopened?: unknown,
    opener?: Opener,
  ): Promise<{
    readonly entries: readonly Entry[];
    readonly elevated: boolean;
    readonly archive: string;
  }> {
    const { archives } = this.access;
    const opened = opener === undefined ? archives?.open(file) : opener(file);
    const opening: Opening | undefined = await (opened ??
      Promise.resolve({
        kind: 'refused',
        reason: strings.commander.noSevenZip,
      }));
    if (opening === undefined) {
      throw new ReadingStopped(file);
    }
    if (opening.kind === 'refused') {
      if (unopened !== undefined) {
        throw unopened;
      }
      throw Object.assign(
        new Error(plainOf(opening.reason)),
        (await isFile(file)) ? {} : { code: 'ENOENT' },
      );
    }
    const inner = path
      .relative(path.resolve(opening.archive.file), path.resolve(folder))
      .split(path.sep)
      .filter((part) => part !== '');
    const entries = opening.archive.tree.entries(inner);
    if (entries !== undefined) {
      return { entries, elevated: false, archive: opening.archive.file };
    }
    const nested = await this.nestedIn(opening.archive, inner);
    if (nested === undefined) {
      throw Object.assign(new Error(folder), { code: 'ENOENT' });
    }
    return this.archiveListed(nested, folder, unopened, opener);
  }

  private async nestedIn(
    archive: OpenedArchive,
    inner: readonly string[],
  ): Promise<string | undefined> {
    const { archives } = this.access;
    if (archives === undefined) {
      return undefined;
    }
    for (let length = inner.length; length > 0; length--) {
      const parts = inner.slice(0, length);
      const folderParts = parts.slice(0, -1);
      const last = parts.at(-1) ?? '';
      const entry = archive.tree
        .entries(folderParts)
        ?.find((each) => each.name === last);
      const item = archive.tree.item(folderParts, last);
      if (entry?.folder === false && item !== undefined) {
        const file = path.join(archive.file, ...parts);
        const opening = await archives.openInside(file, archive, item.path);
        return opening.kind === 'opened' ? file : undefined;
      }
    }
    return undefined;
  }

  async isArchiveFolder(folder: string): Promise<boolean> {
    const inside = this.access.archives?.within(folder);
    return (
      inside !== undefined &&
      (await this.archiveListed(inside.archive.file, folder).then(
        () => true,
        () => false,
      ))
    );
  }

  async openFor(
    page: Page,
    tab: string,
    side: Side,
    file: string,
    opening: (signal: AbortSignal) => Promise<Opening> | undefined = (signal) =>
      this.access.archives?.open(file, signal),
  ): Promise<Opening | undefined> {
    const { archives } = this.access;
    const pane = this.sides.panes.get(tab)?.[side];
    if (archives === undefined || pane === undefined) {
      return {
        kind: 'refused',
        reason: strings.commander.noSevenZip,
        noArchive: true,
      };
    }
    pane.opening?.abort();
    const aborting = new AbortController();
    pane.opening = aborting;
    const { promise: read, resolve: landed } = Promise.withResolvers<void>();
    pane.reading = read;
    let told = false;
    let telling: ReturnType<typeof setTimeout> | undefined;
    const tellLater = () => {
      telling = setTimeout(() => {
        told = true;
        post(page, {
          type: 'readingArchive',
          tab,
          side,
          name: path.basename(file),
        });
      }, readingToldAfter);
    };
    const stopTelling = () => {
      clearTimeout(telling);
      if (told) {
        told = false;
        post(page, { type: 'readingArchive', tab, side });
      }
    };
    const attempt = () => opening(aborting.signal) ?? archives.open(file);
    tellLater();
    try {
      let opened = await attempt();
      while (opened.kind === 'refused' && opened.needsPassword === true) {
        stopTelling();
        const passwordOf = opened.passwordOf ?? file;
        if (
          !(await this.copies.passwordGiven(
            page,
            passwordOf,
            archives.hasPassword(passwordOf),
          ))
        ) {
          return undefined;
        }
        tellLater();
        opened = await attempt();
      }
      return opened;
    } catch (error) {
      if (aborting.signal.aborted) {
        return undefined;
      }
      throw error;
    } finally {
      if (pane.opening === aborting) {
        pane.opening = undefined;
      }
      if (pane.reading === read) {
        pane.reading = undefined;
      }
      landed();
      stopTelling();
    }
  }

  private openingInside(
    pane: Pane,
    name: string,
    signal?: AbortSignal,
  ): Promise<Opening> {
    const { archives } = this.access;
    const inside = archives?.within(pane.folder);
    const parts = name.split(path.sep);
    const last = parts.at(-1) ?? name;
    const folderParts = [...(inside?.inner ?? []), ...parts.slice(0, -1)];
    const entry = inside?.archive.tree
      .entries(folderParts)
      ?.find((each) => each.name === last);
    const item = inside?.archive.tree.item(folderParts, last);
    if (
      archives === undefined ||
      inside === undefined ||
      item === undefined ||
      entry?.folder !== false
    ) {
      return Promise.resolve({
        kind: 'refused',
        reason: strings.commander.notAFile,
        noArchive: true,
      });
    }
    return archives.openInside(
      path.join(pane.folder, name),
      inside.archive,
      item.path,
      signal,
    );
  }

  async enterArchive(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
    }: Extract<CommanderToHost, { type: 'enterArchive' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const entry = listedIn(shown?.pane, name);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      entry === undefined ||
      entry.folder
    ) {
      return;
    }
    const file = path.join(shown.pane.folder, name);
    const { pane } = shown;
    const opening = await this.openFor(
      page,
      shown.tab,
      shown.side,
      file,
      pane.archive === undefined
        ? undefined
        : (signal) => this.openingInside(pane, name, signal),
    );
    if (opening === undefined) {
      return;
    }
    if (opening.kind === 'refused') {
      this.host.refuse(
        page,
        strings.commander.notArchive(path.basename(file), opening.reason),
      );
      return;
    }
    await this.host.list(page, shown.tab, shown.side, file, 'visit');
  }

  async openOnSide(
    page: Page,
    {
      tab,
      from,
      side,
      folder: named,
      name,
    }: Extract<CommanderToHost, { type: 'openOnSide' }>,
  ): Promise<void> {
    const source = this.sides.namingPane(page, tab, from, named);
    if (source === undefined || !isSide(side) || typeof name !== 'string') {
      return Promise.resolve();
    }
    const { folder, flat } = source.pane;
    const entry = listedIn(source.pane, name);
    if (flat === undefined && entry?.folder === false) {
      const file = path.join(folder, name);
      const { pane } = source;
      const opening = await this.openFor(
        page,
        source.tab,
        side,
        file,
        pane.archive === undefined
          ? undefined
          : (signal) => this.openingInside(pane, name, signal),
      );
      if (opening === undefined) {
        return undefined;
      }
      if (opening.kind === 'opened') {
        return this.host.list(page, source.tab, side, file, 'visit');
      }
      if (opening.kind === 'refused' && opening.noArchive !== true) {
        this.host.refuse(
          page,
          strings.commander.notArchive(name, opening.reason),
        );
        return undefined;
      }
    }
    if (flat !== undefined && entry !== undefined) {
      return this.host.list(
        page,
        source.tab,
        side,
        path.dirname(path.join(folder, name)),
        'visit',
        undefined,
        entry.name,
      );
    }
    const target =
      name === parentFolder
        ? folder
        : entry === undefined
          ? undefined
          : entry.folder
            ? path.join(folder, name)
            : folder;
    return target === undefined
      ? Promise.resolve()
      : this.host.list(page, source.tab, side, target, 'visit');
  }
}
