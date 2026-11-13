import type { Store } from '../../../shell/main/storage';
import type { TextEncoding, EndingSource } from '../shared/protocol';
import type {
  Sorts,
  ColumnWidths,
  CommanderSettings,
} from '../shared/settings';
import type { LocalFileSystem } from './fileSystem';
import type { WatchFolder, WatchTree } from './watch';
import type { ContentReader } from './duplicates';
import type { ArchiveAccess } from './archives';
import type { ElevatedFileSystem } from './elevated';
import type { TextDefaults } from './textDefaults';
import type { Saved } from './fileSaving';
import type { ConnectTransfer } from './transfers';
import type { SizeWalker } from './folderSizes';
import type { PdfPlaceStore } from './viewers';
import type { Thumbnails } from './serving';

export interface CommanderAccess {
  readonly pdfPlaces: PdfPlaceStore;
  readonly fileSystem: () => Promise<LocalFileSystem>;
  readonly settings: () => CommanderSettings;
  readonly closesBrackets?: () => boolean;
  readonly defaultColumns: () => ColumnWidths;
  readonly saveShowHidden: (shown: boolean) => Promise<void>;
  readonly saveColumns: (columns: ColumnWidths) => Promise<void>;
  readonly saveSorts: (sorts: Sorts) => Promise<void>;
  readonly saveBookmarks: (bookmarks: readonly string[]) => Promise<void>;
  readonly store: Store;
  readonly thumbnails: Thumbnails;
  readonly streamed?: (file: string) => boolean | Promise<boolean>;
  readonly isRepository: (folder: string) => Promise<boolean>;
  readonly inRepository?: (folder: string) => Promise<boolean>;
  readonly initRepository?: (folder: string) => Promise<void>;
  readonly cloneInto?: (folder: string) => Promise<void>;
  readonly stamp?: (folder: string) => Promise<string | undefined>;
  readonly watch: WatchFolder;
  readonly watchTree?: WatchTree;
  readonly fileIcon: (file: string) => Promise<Uint8Array>;
  readonly platform: NodeJS.Platform;
  readonly codePage: () => Promise<TextEncoding>;
  readonly saveEdited?: (
    file: string,
    bytes: Uint8Array,
    overwriteReadOnly: boolean,
  ) => Promise<Saved>;
  readonly readOnlyFile?: (file: string) => boolean;
  readonly editorDefaults?: (
    file: string,
    asksGit: boolean,
  ) => Promise<TextDefaults>;
  readonly editorSources?: (file: string) => Promise<readonly EndingSource[]>;
  readonly elevate?: () => Promise<ElevatedFileSystem | undefined>;
  readonly realPath: (link: string) => Promise<string>;
  readonly openFile?: (file: string) => Promise<string>;
  readonly trash?: (file: string) => Promise<void>;
  readonly binOff?: (folder: string) => Promise<boolean>;
  readonly remove?: (file: string) => Promise<void>;
  readonly makeFolder?: (folder: string) => Promise<void>;
  readonly renameItem?: (from: string, to: string) => Promise<void>;
  readonly startDrag?: (files: readonly string[]) => Promise<void>;
  readonly clipboardFiles?: {
    readonly write: (files: readonly string[]) => Promise<void>;
    readonly read: () => Promise<readonly string[]>;
  };
  readonly shellMenu?: (
    files: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => Promise<void>;
  readonly connectTransfer: ConnectTransfer;
  readonly archives?: ArchiveAccess;
  readonly viewedCopies?: string;
  readonly sizeWalker?: SizeWalker;
  readonly root: string;
  readonly home?: string;
  readonly variable?: (name: string) => string | undefined;
  readonly knownFolder?: (name: string) => Promise<string | undefined>;
  readonly contentReader?: ContentReader;
}
