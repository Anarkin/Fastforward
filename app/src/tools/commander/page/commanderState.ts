import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { IconSource } from '../shared/icons';
import type { PackFormat, PackLevel, ZipCipher } from '../shared/packing';
import type { CommanderToWebview, FolderCommand } from '../shared/protocol';
import type { Side } from '../shared/sides';
import type { ColumnWidths, SizedColumn } from '../shared/columnWidths';
import type { Layout } from './layouts';
import type { SortColumn } from '../shared/sorts';
import type { ClashAnswer, TransferView } from '../shared/transfers';
import type { KeptTyped } from '../../../lib/page/keptFocus';
import { emptyView, type CommanderView, type ViewAction } from './view';

interface Deleting {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly permanently: boolean;
  readonly binOff?: true;
  readonly archive?: string;
}

interface Transferring {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly target: string;
  readonly move: boolean;
  readonly existing?: readonly string[];
}

interface PackForm {
  readonly format: PackFormat;
  readonly archive: string;
  readonly level: PackLevel;
  readonly password: string;
  readonly shown: boolean;
  readonly encryptNames: boolean;
  readonly zipCipher: ZipCipher;
  readonly splitting: boolean;
  readonly testing: boolean;
  readonly volume: string;
}

interface Packing {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly target: string;
  readonly form?: PackForm;
  readonly fresh?: true;
}

interface PackChoices {
  readonly format: PackFormat;
  readonly level: PackLevel;
  readonly zipCipher: ZipCipher;
  readonly volume: string | undefined;
  readonly test: boolean;
}

interface PackAnswer {
  readonly archive: string;
  readonly format: PackFormat;
  readonly level: PackLevel;
  readonly password?: string;
  readonly encryptNames?: boolean;
  readonly zipCipher?: ZipCipher;
  readonly volume?: string;
  readonly volumeBytes?: number;
  readonly test: boolean;
  readonly replace?: boolean;
}

interface Renaming {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly name: string;
  readonly typed?: KeptTyped;
}

interface MakingFolder {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly typed?: KeptTyped;
}

type TypedDialog =
  'makingFolder' | 'makingFile' | 'renaming' | 'goingTo' | 'markingPattern';

type GoingTo = MakingFolder;

interface MarkingPattern extends MakingFolder {
  readonly mark: boolean;
  readonly initial: string;
}

interface NoAccess {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly asAdministrator: boolean;
}

export interface CommanderSource {
  readonly view: CommanderView;
  readonly drives: readonly string[];
  readonly deleting: Deleting | undefined;
  readonly transferring: Transferring | undefined;
  readonly transfer: TransferView | undefined;
  readonly readingSides: ReadonlyMap<string, number>;
  readonly askingPassword:
    | {
        readonly ask: number;
        readonly name: string;
        readonly wrong: boolean;
        readonly typed?: KeptTyped;
      }
    | undefined;
  readonly askingUpdate:
    | { readonly ask: number; readonly name: string; readonly archive: string }
    | undefined;
  readonly makingFolder: MakingFolder | undefined;
  readonly makingFile: MakingFolder | undefined;
  readonly renaming: Renaming | undefined;
  readonly goingTo: GoingTo | undefined;
  readonly markingPattern: MarkingPattern | undefined;
  readonly lastPattern: string | undefined;
  readonly packing: Packing | undefined;
  readonly parked: ReadonlyMap<string, ParkedDialogs>;
  readonly clashAll:
    | {
        readonly transfer: number;
        readonly asked: number;
        readonly all: boolean;
      }
    | undefined;
  readonly packChoices: PackChoices;
  readonly noAccess: ReadonlyMap<string, NoAccess>;
  readonly resized:
    { readonly from: ColumnWidths; readonly widths: ColumnWidths } | undefined;
  readonly filters: ReadonlyMap<string, PaneFilter>;
}

export interface PaneFilter {
  readonly folder: string | undefined;
  readonly query: string;
  readonly options: SearchOptions;
}

export type ParkedDialogs = Partial<
  Pick<
    CommanderSource,
    | 'deleting'
    | 'transferring'
    | 'makingFolder'
    | 'makingFile'
    | 'renaming'
    | 'goingTo'
    | 'markingPattern'
    | 'packing'
  >
>;

export interface CommanderActions {
  readonly receive: (message: CommanderToWebview) => void;
  readonly dispatch: (action: ViewAction) => void;
  readonly select: (side: Side, key: string) => void;
  readonly mark: (side: Side, keys: readonly string[], marked: boolean) => void;
  readonly activate: (side: Side) => void;
  readonly switchSide: () => void;
  readonly chooseLayout: (side: Side, layout: Layout) => void;
  readonly sort: (side: Side, column: SortColumn) => void;
  readonly groupByColor: (side: Side) => void;
  readonly open: (side: Side, name: string) => void;
  readonly step: (side: Side, step: -1 | 1) => void;
  readonly viewFile: (side: Side, name: string) => void;
  readonly editFile: (side: Side, name: string) => void;
  readonly openRepository: (side: Side, name: string) => void;
  readonly folderCommand: (
    side: Side,
    name: string | undefined,
    command: FolderCommand,
  ) => void;
  readonly openOnSide: (from: Side, side: Side, name: string) => void;
  readonly enterArchive: (side: Side, name: string) => void;
  readonly answerPassword: (password: string | undefined) => void;
  readonly answerUpdate: (update: boolean) => void;
  readonly drive: (side: Side, drive: string) => void;
  readonly listDrives: () => void;
  readonly addBookmark: (side: Side) => void;
  readonly removeBookmark: (folder: string) => void;
  readonly goToBookmark: (side: Side, folder: string) => void;
  readonly reread: () => void;
  readonly toggleHidden: () => void;
  readonly compare: () => void;
  readonly shellMenu: (
    side: Side,
    names: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => void;
  readonly askDelete: (
    side: Side,
    names: readonly string[],
    permanently: boolean,
  ) => void;
  readonly confirmDelete: () => void;
  readonly cancelDelete: () => void;
  readonly askTransfer: (
    side: Side,
    names: readonly string[],
    move: boolean,
  ) => void;
  readonly confirmTransfer: (answer?: 'replace' | 'skip') => void;
  readonly cancelTransfer: () => void;
  readonly answerClash: (answer: ClashAnswer, all: boolean) => void;
  readonly copyToClipboard: (side: Side, names: readonly string[]) => void;
  readonly paste: (side: Side) => void;
  readonly drag: (side: Side, names: readonly string[]) => void;
  readonly dropOn: (
    side: Side,
    files: readonly File[],
    into: string | undefined,
    move: boolean,
  ) => void;
  readonly askNewFolder: (side: Side) => void;
  readonly makeFolder: (name: string) => void;
  readonly cancelNewFolder: () => void;
  readonly askNewFile: (side: Side) => void;
  readonly makeFile: (name: string) => void;
  readonly cancelNewFile: () => void;
  readonly askRename: (side: Side, name: string) => void;
  readonly rename: (to: string) => void;
  readonly cancelRename: () => void;
  readonly askGoTo: (side: Side) => void;
  readonly askMarkPattern: (
    side: Side,
    mark: boolean,
    suggested: string,
  ) => void;
  readonly markPattern: (pattern: string) => void;
  readonly cancelMarkPattern: () => void;
  readonly goTo: (to: string) => void;
  readonly cancelGoTo: () => void;
  readonly askPack: (side: Side, names: readonly string[]) => void;
  readonly pack: (answer: PackAnswer) => void;
  readonly cancelPack: () => void;
  readonly keepTyped: (dialog: TypedDialog, typed: KeptTyped) => void;
  readonly keepPasswordTyped: (typed: KeptTyped) => void;
  readonly keepPackForm: (change: Partial<PackForm>) => void;
  readonly keepClashAll: (all: boolean) => void;
  readonly testArchives: (side: Side, names: readonly string[]) => void;
  readonly stopTransfer: () => void;
  readonly hideTransfer: () => void;
  readonly elevate: () => void;
  readonly closeNoAccess: () => void;
  readonly resizeColumn: (column: SizedColumn, width: number) => void;
  readonly saveColumn: (column: SizedColumn, width: number) => void;
  readonly resetColumn: (column: SizedColumn) => void;
  readonly dropIcon: (ticket: string) => void;
  readonly iconTicketOf: (url: string) => string | undefined;
  readonly iconCame: (url: string, ticket: string) => void;
  readonly scrollOf: (key: string) => number;
  readonly filterSide: (
    side: Side,
    query: string | undefined,
    options?: SearchOptions,
  ) => void;
  readonly flat: (side: Side) => void;
  readonly duplicates: (side: Side) => void;
  readonly stopReading: (side: Side) => void;
  readonly countSizes: (side: Side, names: readonly string[]) => void;
  readonly keepScroll: (key: string, offset: number) => void;
  readonly keepTabs: () => void;
  readonly releaseTab: (tab: string) => string | undefined;
  readonly saveThumbnail: (
    source: IconSource,
    box: number,
    pixelRatio: number,
    made: Blob,
  ) => Promise<void>;
}

export type CommanderState = CommanderSource & CommanderActions;

export const commanderDefaults: CommanderSource = {
  view: emptyView,
  drives: [],
  deleting: undefined,
  transferring: undefined,
  transfer: undefined,
  readingSides: new Map(),
  askingPassword: undefined,
  askingUpdate: undefined,
  makingFolder: undefined,
  makingFile: undefined,
  renaming: undefined,
  goingTo: undefined,
  markingPattern: undefined,
  lastPattern: undefined,
  packing: undefined,
  parked: new Map(),
  clashAll: undefined,
  packChoices: {
    format: 'zip',
    level: 'normal',
    zipCipher: 'aes256',
    volume: undefined,
    test: true,
  },
  noAccess: new Map(),
  resized: undefined,
  filters: new Map(),
};
