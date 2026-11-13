import type { Sentence } from '../../../shared/strings';
import type { PdfPlace } from '../../../shared/pdf';
import type { PackFormat, PackLevel, ZipCipher } from './packing';
import type { ColumnWidths, FileColor, Sort, Sorts } from './settings';
import type { KeptBytes, LineEnding, StrayEnding } from './textMarks';
import type { ClashAnswer, TransferView } from './transfers';

export interface ComparedFile {
  readonly side: Side;
  readonly folder: string;
  readonly name: string;
}

export interface TextRow {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly cut?: true;
}

export const textEncodings = [
  'utf-8',
  'utf-16le',
  'utf-16be',
  'windows-1252',
  'windows-1250',
  'windows-1251',
  'windows-1253',
  'windows-1254',
  'windows-1255',
  'windows-1256',
  'windows-1257',
  'windows-1258',
  'windows-874',
  'iso-8859-2',
  'iso-8859-3',
  'iso-8859-4',
  'iso-8859-5',
  'iso-8859-6',
  'iso-8859-7',
  'iso-8859-8',
  'iso-8859-8-i',
  'iso-8859-10',
  'iso-8859-13',
  'iso-8859-14',
  'iso-8859-15',
  'iso-8859-16',
  'koi8-r',
  'koi8-u',
  'ibm866',
  'macintosh',
  'x-mac-cyrillic',
] as const;

export type TextEncoding = (typeof textEncodings)[number];

export function isTextEncoding(value: unknown): value is TextEncoding {
  return textEncodings.some((encoding) => encoding === value);
}

export const maxRowsAsked = 1000;
export const maxFindLength = 1000;

export const maxColoredBytes = 10 * 1024 * 1024;

export const wholeLineBytes = 64 * 1024;

export const maxPreviewBytes = 1024 * 1024;

export const maxBytesAsked = 64 * 1024;

export interface Entry {
  readonly name: string;
  readonly folder: boolean;
  readonly link: boolean;
  readonly hidden: boolean;
  readonly size: number | undefined;
  readonly modified: number | undefined;
  readonly online?: true;
  readonly executable?: true;
  readonly counting?: true;
  readonly unreadFolders?: number;
}

export interface FlatFolder {
  readonly under: string;
  readonly entries: readonly Entry[];
}

export interface FlatProgress {
  readonly reading: boolean;
  readonly stopped: boolean;
  readonly folders: number;
  readonly failed: number;
}

export const sides = ['left', 'right'] as const;

export type Side = (typeof sides)[number];

export const parentFolder = '..';

export function isSide(value: unknown): value is Side {
  return sides.some((side) => side === value);
}

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

const folderCommands = [
  'newTerminal',
  'openInGit',
  'cloneHere',
  'initHere',
] as const;

export type FolderCommand = (typeof folderCommands)[number];

export function isFolderCommand(value: unknown): value is FolderCommand {
  return folderCommands.some((command) => command === value);
}

export type EndingSource =
  | {
      readonly kind: 'editorConfig';
      readonly ending?: LineEnding;
      readonly file?: string;
    }
  | {
      readonly kind: 'git';
      readonly ending?: LineEnding;
      readonly by?: 'eol' | 'core.autocrlf' | 'core.eol';
    }
  | {
      readonly kind: 'extension';
      readonly ending?: LineEnding;
      readonly extension: string;
    }
  | { readonly kind: 'settings'; readonly ending: LineEnding };

export type EncodingSource =
  | { readonly kind: 'chosen'; readonly encoding?: TextEncoding }
  | { readonly kind: 'bom'; readonly encoding?: TextEncoding }
  | { readonly kind: 'utf16'; readonly encoding?: TextEncoding }
  | { readonly kind: 'utf8'; readonly encoding?: TextEncoding }
  | { readonly kind: 'codePage'; readonly encoding: TextEncoding }
  | {
      readonly kind: 'editorConfig';
      readonly encoding?: TextEncoding;
      readonly bom?: boolean;
      readonly file?: string;
    }
  | {
      readonly kind: 'settings';
      readonly encoding: TextEncoding;
      readonly bom: boolean;
    };

export interface TextShown {
  readonly text: string;
  readonly version: number;
  readonly encoding: TextEncoding;
  readonly bom: boolean;
  readonly ending: LineEnding;
  readonly strayEndings: readonly StrayEnding[];
  readonly keptBytes: readonly KeptBytes[];
  readonly indent?: string;
  readonly fallbackIndent?: string;
  readonly trimTrailingWhitespace?: true;
  readonly insertFinalNewline?: true;
}

export type CommanderToHost =
  | {
      readonly type: 'editFile';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | { readonly type: 'readEdited'; readonly tab: string }
  | {
      readonly type: 'editText';
      readonly tab: string;
      readonly update: unknown;
    }
  | {
      readonly type: 'editState';
      readonly tab: string;
      readonly version: number;
      readonly state: unknown;
    }
  | {
      readonly type: 'saveText';
      readonly tab: string;
      readonly overwriteReadOnly?: true;
      readonly overwriteChanged?: true;
    }
  | { readonly type: 'reloadEdited'; readonly tab: string }
  | {
      readonly type: 'saveIn';
      readonly tab: string;
      readonly encoding: TextEncoding;
      readonly bom: boolean;
    }
  | {
      readonly type: 'reopenIn';
      readonly tab: string;
      readonly encoding: TextEncoding | 'auto';
    }
  | {
      readonly type: 'open';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'drive';
      readonly tab: string;
      readonly side: Side;
      readonly drive: string;
    }
  | { readonly type: 'listDrives' }
  | {
      readonly type: 'compare';
      readonly tab: string;
      readonly files: readonly [ComparedFile, ComparedFile] | readonly [];
    }
  | {
      readonly type: 'readBytes';
      readonly tab: string;
      readonly request: number;
      readonly start: number;
      readonly length: number;
    }
  | {
      readonly type: 'readText';
      readonly tab: string;
      readonly encoding: TextEncoding;
      readonly request: number;
    }
  | {
      readonly type: 'readPdfPlace';
      readonly tab: string;
      readonly fingerprint: string;
      readonly request: number;
    }
  | {
      readonly type: 'savePdfPlace';
      readonly tab: string;
      readonly fingerprint: string;
      readonly place: PdfPlace;
    }
  | {
      readonly type: 'findText';
      readonly tab: string;
      readonly encoding: TextEncoding;
      readonly query: string;
      readonly request: number;
    }
  | {
      readonly type: 'stopFind';
      readonly tab: string;
      readonly request: number;
    }
  | {
      readonly type: 'readRows';
      readonly tab: string;
      readonly encoding: TextEncoding;
      readonly request: number;
      readonly anchor: number;
      readonly exact: boolean;
      readonly before: number;
      readonly after: number;
      readonly least: number;
    }
  | {
      readonly type: 'view';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'shellMenu';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly x: number;
      readonly y: number;
      readonly extended: boolean;
    }
  | {
      readonly type: 'delete';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly permanently: boolean;
    }
  | {
      readonly type: 'transfer';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly target: string;
      readonly move: boolean;
      readonly existing?: 'replace' | 'skip';
    }
  | {
      readonly type: 'answerClash';
      readonly transfer: number;
      readonly asked: number;
      readonly answer: ClashAnswer;
      readonly all: boolean;
    }
  | {
      readonly type: 'newFolder';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'newFile';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'editSource';
      readonly tab: string;
      readonly file: string;
    }
  | {
      readonly type: 'editViewed';
      readonly tab: string;
      readonly at: number;
      readonly encoding?: TextEncoding;
    }
  | {
      readonly type: 'testArchives';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | {
      readonly type: 'pack';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly archive: string;
      readonly format: PackFormat;
      readonly level: PackLevel;
      readonly password?: string;
      readonly encryptNames?: boolean;
      readonly zipCipher?: ZipCipher;
      readonly volumeBytes?: number;
      readonly test?: boolean;
      readonly replace?: boolean;
    }
  | {
      readonly type: 'rename';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
      readonly to: string;
    }
  | {
      readonly type: 'copyToClipboard';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | {
      readonly type: 'drag';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | {
      readonly type: 'paste';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
    }
  | { readonly type: 'stopTransfer'; readonly transfer: number }
  | { readonly type: 'hideTransfer'; readonly transfer: number }
  | { readonly type: 'reread'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'flat';
      readonly tab: string;
      readonly side: Side;
      readonly flat: boolean;
    }
  | { readonly type: 'stopReading'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'countSizes';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | { readonly type: 'elevate'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'openRepository';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'folderCommand';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name?: string;
      readonly command: FolderCommand;
    }
  | {
      readonly type: 'password';
      readonly ask: number;
      readonly password?: string;
    }
  | {
      readonly type: 'updateArchive';
      readonly ask: number;
      readonly update: boolean;
    }
  | {
      readonly type: 'enterArchive';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'openOnSide';
      readonly tab: string;
      readonly from: Side;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'step';
      readonly tab: string;
      readonly side: Side;
      readonly step: -1 | 1;
    }
  | { readonly type: 'activate'; readonly tab: string; readonly side: Side }
  | { readonly type: 'columns'; readonly columns: ColumnWidths }
  | { readonly type: 'sort'; readonly side: Side; readonly sort: Sort }
  | {
      readonly type: 'saveThumbnail';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
      readonly box: number;
      readonly pixelRatio: number;
      readonly bytes: Uint8Array;
    }
  | { readonly type: 'showHidden'; readonly shown: boolean }
  | {
      readonly type: 'addBookmark';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
    }
  | { readonly type: 'removeBookmark'; readonly folder: string }
  | {
      readonly type: 'goToBookmark';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
    }
  | {
      readonly type: 'goTo';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly to: string;
    }
  | {
      readonly type: 'duplicates';
      readonly tab: string;
      readonly side: Side;
      readonly duplicates: boolean;
    }
  | { readonly type: 'dropIcons'; readonly tickets: readonly string[] };

export interface CommanderDrop {
  readonly type: 'drop';
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly into?: string;
  readonly move: boolean;
}

export function isDrop(message: unknown): message is CommanderDrop {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const field = (name: string): unknown => Reflect.get(message, name);
  const into = field('into');
  return (
    field('type') === 'drop' &&
    typeof field('tab') === 'string' &&
    isSide(field('side')) &&
    typeof field('folder') === 'string' &&
    (into === undefined || typeof into === 'string') &&
    typeof field('move') === 'boolean'
  );
}

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export type CommanderToWebview =
  | {
      readonly type: 'settings';
      readonly showHidden: boolean;
      readonly sort: Sorts;
      readonly columns: ColumnWidths;
      readonly defaultColumns: ColumnWidths;
      readonly canElevate: boolean;
      readonly platform: string;
      readonly thumbnailSize: number;
      readonly fileColors: readonly FileColor[];
      readonly bookmarks: readonly string[];
    }
  | { readonly type: 'drives'; readonly drives: readonly string[] }
  | { readonly type: 'transfer'; readonly view: TransferView | undefined }
  | {
      readonly type: 'show';
      readonly tab: string;
      readonly file?: string;
      readonly edit?: true;
    }
  | {
      readonly type: 'editing';
      readonly tab: string;
      readonly file: string;
      readonly version?: number;
      readonly encoding?: TextEncoding;
      readonly bom?: true;
      readonly readAs?: TextEncoding;
      readonly changed?: true;
      readonly readOnly?: true;
      readonly made?: true;
      readonly error?: Sentence;
      readonly endingSources?: readonly EndingSource[];
      readonly encodingSources?: readonly EncodingSource[];
    }
  | {
      readonly type: 'editedText';
      readonly tab: string;
      readonly shown: TextShown;
      readonly state?: unknown;
      readonly reloaded?: true;
      readonly at?: number;
    }
  | {
      readonly type: 'textChanged';
      readonly tab: string;
      readonly changed: boolean;
    }
  | { readonly type: 'askOverwrite'; readonly tab: string }
  | { readonly type: 'askChangedOnDisk'; readonly tab: string }
  | { readonly type: 'hide' }
  | { readonly type: 'closed'; readonly tab: string }
  | {
      readonly type: 'viewing';
      readonly tab: string;
      readonly size: number | undefined;
      readonly version?: string;
      readonly binary?: boolean;
      readonly hidden?: readonly boolean[];
      readonly detected?: TextEncoding;
      readonly error?: Sentence;
    }
  | {
      readonly type: 'bytes';
      readonly tab: string;
      readonly request: number;
      readonly start: number;
      readonly data: readonly number[];
    }
  | {
      readonly type: 'text';
      readonly tab: string;
      readonly request: number;
      readonly text: string | undefined;
    }
  | {
      readonly type: 'pdfPlace';
      readonly tab: string;
      readonly request: number;
      readonly place?: PdfPlace;
    }
  | {
      readonly type: 'found';
      readonly tab: string;
      readonly request: number;
      readonly matches: readonly ByteRange[];
      readonly capped: boolean;
      readonly done: boolean;
    }
  | {
      readonly type: 'rows';
      readonly tab: string;
      readonly request: number;
      readonly size: number;
      readonly rows: readonly TextRow[];
      readonly anchorIndex: number;
    }
  | {
      readonly type: 'noAccess';
      readonly side: Side;
      readonly folder: string;
      readonly asAdministrator: boolean;
    }
  | {
      readonly type: 'listing';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly hidden: readonly boolean[];
      readonly entries: readonly Entry[];
      readonly parent: boolean;
      readonly back: boolean;
      readonly forward: boolean;
      readonly elevated: boolean;
      readonly binOff?: true;
      readonly archive?: string;
      readonly selected: string | undefined;
      readonly flat?: number;
      readonly duplicates?: number;
    }
  | {
      readonly type: 'duplicateGroups';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly look: number;
      readonly groups: readonly (readonly string[])[];
      readonly reading: boolean;
    }
  | {
      readonly type: 'folderSizes';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly entries: readonly Entry[];
    }
  | {
      readonly type: 'flatFiles';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly walk: number;
      readonly folders: readonly FlatFolder[];
      readonly progress: FlatProgress;
    }
  | {
      readonly type: 'askPassword';
      readonly ask: number;
      readonly name: string;
      readonly wrong: boolean;
    }
  | {
      readonly type: 'askUpdate';
      readonly ask: number;
      readonly name: string;
      readonly archive: string;
    }
  | {
      readonly type: 'askExisting';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly target: string;
      readonly move: boolean;
      readonly existing: readonly string[];
    }
  | {
      readonly type: 'readingArchive';
      readonly tab: string;
      readonly side: Side;
      readonly name?: string;
    }
  | {
      readonly type: 'repositories';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly inRepository?: true;
    };

export type CommanderToWebviewOf<T extends CommanderToWebview['type']> =
  Extract<CommanderToWebview, { readonly type: T }>;
