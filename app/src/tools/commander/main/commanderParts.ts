import type { Sentence } from '../../../lib/shared/sentences';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import { SavedSides } from './savedSides';
import type { LocalFileSystem } from './fileSystem';
import { Editing } from './editing';
import { editingFiles } from './editingFiles';
import { SettingsCommands } from './settingsCommands';
import { Icons } from './icons';
import { Transfers } from './transfers';
import { Sides } from './sides';
import { post } from './post';
import { SideFlat } from './sideFlat';
import { SideSizes } from './sideSizes';
import { SideDuplicates } from './sideDuplicates';
import { Serving } from './serving';
import { ThumbnailServing } from './thumbnailServing';
import { ArchiveCopies } from './archiveCopies';
import { ArchivePasswords } from './archivePasswords';
import { ArchiveCommands } from './archiveCommands';
import { TransferCommands } from './transferCommands';
import { ArchiveTransferCommands } from './archiveTransferCommands';
import { PackCommands } from './packCommands';
import type { CommanderAccess } from './commanderAccess';
import { FileCommands } from './fileCommands';
import { ItemChanges } from './itemChanges';
import { SystemCommands } from './systemCommands';
import { ArchiveListing } from './archiveListing';
import { Listings } from './listings';
import { Navigation } from './navigation';
import { SideRepositories } from './sideRepositories';
import { Elevation } from './elevation';
import { CommanderMessages } from './commanderMessages';

export interface CommanderParts {
  readonly sides: Sides;
  readonly flat: SideFlat;
  readonly sizes: SideSizes;
  readonly duplicates: SideDuplicates;
  readonly serving: Serving;
  readonly thumbnailServing: ThumbnailServing;
  readonly passwords: ArchivePasswords;
  readonly copies: ArchiveCopies;
  readonly transferCommands: TransferCommands;
  readonly icons: Icons;
  readonly transfers: Transfers;
  readonly savedSides: SavedSides;
  readonly editing: Editing;
  readonly listings: Listings;
  readonly elevation: Elevation;
  readonly settings: SettingsCommands;
  readonly messages: CommanderMessages;
  readonly fileCommands: FileCommands;
}

export function buildParts(
  access: CommanderAccess,
  shell: () => ShellAccess,
  saveQuietly: (saving: Promise<void>) => void,
  files: () => Promise<LocalFileSystem>,
  postDrives: (page: Page) => Promise<void>,
): CommanderParts {
  const refuse = (page: Page, message: Sentence): void => {
    shell().notice(page, { level: 'error', message });
  };
  let transferPage: Page | undefined;
  const sides = new Sides();
  const icons = new Icons(access.fileIcon, access.platform);
  const flat = new SideFlat(access, sides, {
    listed: (folder) => listings.listed(folder),
    postListing: (page, tab, side, pane, selected) =>
      listings.postListing(page, tab, side, pane, selected),
    list: (page, tab, side, folder, how) =>
      listings.list(page, tab, side, folder, how),
    endSizing: (pane) => sizes.endSizing(pane),
    flatRead: (pane) => duplicates.feedDuplicates(pane),
  });
  const sizes = new SideSizes(access, sides, {
    listed: (folder) => listings.listed(folder),
  });
  const duplicates = new SideDuplicates(access, sides, {
    postListing: (page, tab, side, pane, selected) =>
      listings.postListing(page, tab, side, pane, selected),
  });
  const serving = new Serving(sides, icons, () => shell().tabs());
  const thumbnailServing = new ThumbnailServing(access, sides);
  const editing = new Editing(
    editingFiles(access, () => copies),
    {
      post: (page, message) => post(page, message),
      notice: (page, notice) => shell().notice(page, notice),
      namesChanged: (page) => shell().postTabs(page),
      pagesShowing: (tab) =>
        [...sides.shown]
          .filter(([, showing]) => showing.tab === tab)
          .map(([page]) => page),
      holds: (page, tab) => shell().holds(page, tab),
      openEdit: (page, file) => shell().openEdit(page, 'commander', file),
    },
  );
  const savedSides = new SavedSides(access.store);
  const transfers = new Transfers(access.connectTransfer, {
    show: (view) => {
      const kept = transferPage;
      const page = kept === undefined || kept.disposed ? shell().page() : kept;
      transferPage = view === undefined ? undefined : page;
      if (page !== undefined) {
        post(page, { type: 'transfer', view });
      }
    },
    notice: (notice) => shell().notice(undefined, notice),
    finished: (ask) => transferCommands.transferred(ask),
  });
  const passwords = new ArchivePasswords(access);
  const copies = new ArchiveCopies(
    access,
    sides,
    passwords,
    editing,
    transfers,
    {
      shell,
      refuse: (page, message) => refuse(page, message),
      saveQuietly: (saving) => saveQuietly(saving),
    },
  );
  const archiveCommands = new ArchiveCommands(access, transfers, {
    shell,
    refuse: (page, message) => refuse(page, message),
  });
  const transferCommands = new TransferCommands(
    access,
    sides,
    new ArchiveTransferCommands(access, passwords, archiveCommands, transfers, {
      refuse: (page, message) => refuse(page, message),
    }),
    transfers,
    {
      shell,
      refuse: (page, message) => refuse(page, message),
      list: (page, tab, side, folder, how, fallback, selecting) =>
        listings.list(page, tab, side, folder, how, fallback, selecting),
    },
  );
  const packCommands = new PackCommands(access, sides, passwords, transfers, {
    shell,
    refuse: (page, message) => refuse(page, message),
  });
  const fileCommands = new FileCommands(access, sides, copies, editing, {
    shell,
    list: (...listed) => listings.list(...listed),
  });
  const itemChanges = new ItemChanges(access, sides, archiveCommands, {
    shell,
    list: (...listed) => listings.list(...listed),
  });
  const systemCommands = new SystemCommands(access, sides, copies, {
    shell,
  });
  const archiveListing = new ArchiveListing(access, sides, passwords, {
    refuse: (page, message) => refuse(page, message),
    list: (page, tab, side, folder, how, fallback, selecting) =>
      listings.list(page, tab, side, folder, how, fallback, selecting),
  });
  const listings = new Listings(
    access,
    sides,
    {
      archiveListing,
      flat,
      sizes,
      duplicates,
      copies,
      savedSides,
      repositories: new SideRepositories(access, sides),
    },
    {
      shell,
      elevated: () => elevation.current,
      files: () => files(),
      saveQuietly: (saving) => saveQuietly(saving),
    },
  );
  const navigation = new Navigation(access, sides, {
    list: (...listed) => listings.list(...listed),
    files: () => files(),
  });
  const elevation = new Elevation(access, sides, listings, {
    shell,
  });
  const settings = new SettingsCommands(access, sides);
  const messages = new CommanderMessages(
    sides,
    fileCommands,
    editing,
    navigation,
    systemCommands,
    itemChanges,
    transferCommands,
    packCommands,
    transfers,
    listings,
    flat,
    sizes,
    archiveListing,
    passwords,
    copies,
    elevation,
    settings,
    thumbnailServing,
    icons,
    duplicates,
    postDrives,
  );
  return {
    sides,
    flat,
    sizes,
    duplicates,
    serving,
    thumbnailServing,
    passwords,
    copies,
    transferCommands,
    icons,
    transfers,
    savedSides,
    editing,
    listings,
    elevation,
    settings,
    messages,
    fileCommands,
  };
}
