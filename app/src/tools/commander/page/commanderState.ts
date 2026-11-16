import type { EditorState } from '@codemirror/state';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { IconSource } from '../shared/icons';
import type { PackFormat, PackLevel, ZipCipher } from '../shared/packing';
import type { PdfPlace } from '../shared/pdf';
import type { Sentence } from '../../../lib/shared/sentences';
import type {
  ByteRange,
  CommanderToHost,
  CommanderToWebview,
  CommanderToWebviewOf,
  FolderCommand,
} from '../shared/protocol';
import type { Side } from '../shared/sides';
import type { TextEncoding } from '../shared/textEncodings';
import type { ColumnWidths, SizedColumn } from '../shared/columnWidths';
import type { Layout } from './layouts';
import type { SortColumn } from '../shared/sorts';
import type { ClashAnswer, TransferView } from '../shared/transfers';
import type { EditorPlace } from './editorPlace';
import type { EditedTab, ToEditor } from './editorState';
import type { KeptViewer } from './viewerKept';
import type { KeptTyped } from '../../../lib/page/keptFocus';
import type { EditorAsk, KeptEditing } from './editorKept';
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

export interface PackForm {
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
  readonly viewed: Viewing | undefined;
  readonly keptViewed: ReadonlyMap<string, Viewing>;
  readonly edited: EditedTab | undefined;
  readonly editorAsks: ReadonlyMap<string, EditorAsk>;
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
  readonly request: (message: ViewerRequest) => void;
  readonly listenViewer: (handler: (message: ToViewer) => void) => () => void;
  readonly findText: (
    tab: string,
    encoding: TextEncoding,
    query: string,
    options: SearchOptions,
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
  readonly keptEditing: (tab: string) => KeptEditing;
  readonly keepEditing: (tab: string, change: Partial<KeptEditing>) => void;
  readonly answerEditorAsk: (tab: string) => void;
  readonly editorKeeper: (tab: string) => (kept: KeptEditor) => void;
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
  readonly keepPackForm: (form: PackForm) => void;
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
  readonly placeOf: (tab: string) => number;
  readonly keepPlace: (tab: string, byte: number) => void;
  readonly keptViewer: (tab: string) => KeptViewer;
  readonly keepViewer: (tab: string, change: Partial<KeptViewer>) => void;
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
  keptViewed: new Map(),
  edited: undefined,
  editorAsks: new Map(),
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
