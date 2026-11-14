import type { EditorState } from '@codemirror/state';
import type { IconSource } from '../shared/icons';
import type { PackFormat, PackLevel, ZipCipher } from '../shared/packing';
import type { PdfPlace } from '../shared/pdf';
import type { Sentence } from '../../../lib/shared/strings';
import type {
  ByteRange,
  CommanderToHost,
  CommanderToWebview,
  CommanderToWebviewOf,
  FolderCommand,
  Side,
  TextEncoding,
} from '../shared/protocol';
import type {
  ColumnWidths,
  Layout,
  SizedColumn,
  SortColumn,
} from '../shared/settings';
import type { ClashAnswer, TransferView } from '../shared/transfers';
import type { EditorPlace } from './editorPlace';
import type { EditedTab, ToEditor } from './editorState';
import {
  emptyView,
  type CommanderView,
  type ViewAction,
  type ViewerChoices,
} from './view';

export interface Viewing {
  readonly tab: string;
  readonly size: number | undefined;
  readonly version?: string;
  readonly binary?: boolean;
  readonly hidden?: readonly boolean[];
  readonly detected?: TextEncoding;
  readonly error?: Sentence;
}

export type ToViewer = CommanderToWebviewOf<
  'rows' | 'text' | 'bytes' | 'found' | 'pdfPlace'
>;

type ViewerRequest = Extract<
  CommanderToHost,
  {
    readonly type: 'readText' | 'readRows' | 'readBytes';
  }
>;

export interface Deleting {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly permanently: boolean;
  readonly binOff?: true;
  readonly archive?: string;
}

export interface Transferring {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly target: string;
  readonly move: boolean;
  readonly existing?: readonly string[];
}

interface Packing {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly target: string;
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
}

interface MakingFolder {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
}

type GoingTo = MakingFolder;

interface MarkingPattern extends MakingFolder {
  readonly mark: boolean;
  readonly initial: string;
}

interface NoAccess {
  readonly side: Side;
  readonly folder: string;
  readonly asAdministrator: boolean;
}

export interface CommanderSource {
  readonly view: CommanderView;
  readonly drives: readonly string[];
  readonly viewed: Viewing | undefined;
  readonly edited: EditedTab | undefined;
  readonly deleting: Deleting | undefined;
  readonly transferring: Transferring | undefined;
  readonly transfer: TransferView | undefined;
  readonly readingArchives: ReadonlyMap<string, string>;
  readonly askingPassword:
    | { readonly ask: number; readonly name: string; readonly wrong: boolean }
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
  readonly packChoices: PackChoices;
  readonly noAccess: NoAccess | undefined;
  readonly resized:
    { readonly from: ColumnWidths; readonly widths: ColumnWidths } | undefined;
  readonly filters: ReadonlyMap<string, PaneFilter>;
}

export interface PaneFilter {
  readonly folder: string | undefined;
  readonly query: string;
}

export interface CommanderActions {
  readonly receive: (message: CommanderToWebview) => void;
  readonly request: (message: ViewerRequest) => void;
  readonly listenViewer: (handler: (message: ToViewer) => void) => () => void;
  readonly findText: (
    tab: string,
    encoding: TextEncoding,
    query: string,
    onFound: (found: {
      readonly matches: readonly ByteRange[];
      readonly done: boolean;
    }) => void,
  ) => () => void;
  readonly readWholeText: (
    tab: string,
    encoding: TextEncoding,
    onText: (text: string) => void,
  ) => () => void;
  readonly readPdfPlace: (
    tab: string,
    fingerprint: string,
  ) => Promise<PdfPlace | undefined>;
  readonly keepPdfPlace: (
    tab: string,
    fingerprint: string,
    place: PdfPlace,
  ) => void;
  readonly flushPdfPlace: () => void;
  readonly dispatch: (action: ViewAction) => void;
  readonly select: (side: Side, key: string) => void;
  readonly mark: (side: Side, keys: readonly string[], marked: boolean) => void;
  readonly activate: (side: Side) => void;
  readonly switchSide: () => void;
  readonly chooseLayout: (side: Side, layout: Layout) => void;
  readonly choose: (choices: Partial<ViewerChoices>) => void;
  readonly sort: (side: Side, column: SortColumn) => void;
  readonly groupByColor: (side: Side) => void;
  readonly open: (side: Side, name: string) => void;
  readonly step: (side: Side, step: -1 | 1) => void;
  readonly viewFile: (side: Side, name: string) => void;
  readonly editFile: (side: Side, name: string) => void;
  readonly listenEditor: (handler: (message: ToEditor) => void) => () => void;
  readonly readEdited: (tab: string) => void;
  readonly editText: (tab: string, update: unknown) => void;
  readonly keepEditState: (
    tab: string,
    version: number,
    state: unknown,
  ) => void;
  readonly saveText: (
    tab: string,
    overwrite?: { readonly readOnly?: boolean; readonly changed?: boolean },
  ) => void;
  readonly reloadEdited: (tab: string) => void;
  readonly editSource: (tab: string, file: string) => void;
  readonly editViewed: (
    tab: string,
    at: number,
    encoding: TextEncoding | undefined,
  ) => void;
  readonly saveIn: (
    tab: string,
    encoding: TextEncoding | 'auto',
    bom: boolean,
  ) => void;
  readonly reopenIn: (tab: string, encoding: TextEncoding | 'auto') => void;
  readonly keptEditor: (tab: string) => KeptEditor | undefined;
  readonly keepEditor: (tab: string, kept: KeptEditor) => void;
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
  readonly testArchives: (side: Side, names: readonly string[]) => void;
  readonly stopTransfer: () => void;
  readonly hideTransfer: () => void;
  readonly elevate: () => void;
  readonly closeNoAccess: () => void;
  readonly resizeColumn: (column: SizedColumn, width: number) => void;
  readonly saveColumn: (column: SizedColumn, width: number) => void;
  readonly resetColumn: (column: SizedColumn) => void;
  readonly dropIcon: (ticket: string) => void;
  readonly scrollOf: (key: string) => number;
  readonly placeOf: (tab: string) => number;
  readonly keepPlace: (tab: string, byte: number) => void;
  readonly filterSide: (side: Side, query: string | undefined) => void;
  readonly flat: (side: Side) => void;
  readonly duplicates: (side: Side) => void;
  readonly stopReading: (side: Side) => void;
  readonly countSizes: (side: Side, names: readonly string[]) => void;
  readonly keepScroll: (key: string, offset: number) => void;
  readonly saveThumbnail: (
    source: IconSource,
    box: number,
    pixelRatio: number,
    made: Blob,
  ) => Promise<void>;
}

export interface KeptEditor {
  readonly state: EditorState;
  readonly version: number;
  readonly place?: EditorPlace | undefined;
}

export type CommanderState = CommanderSource & CommanderActions;

export const commanderDefaults: CommanderSource = {
  view: emptyView,
  drives: [],
  viewed: undefined,
  edited: undefined,
  deleting: undefined,
  transferring: undefined,
  transfer: undefined,
  readingArchives: new Map(),
  askingPassword: undefined,
  askingUpdate: undefined,
  makingFolder: undefined,
  makingFile: undefined,
  renaming: undefined,
  goingTo: undefined,
  markingPattern: undefined,
  lastPattern: undefined,
  packing: undefined,
  packChoices: {
    format: 'zip',
    level: 'normal',
    zipCipher: 'aes256',
    volume: undefined,
    test: true,
  },
  noAccess: undefined,
  resized: undefined,
  filters: new Map(),
};
