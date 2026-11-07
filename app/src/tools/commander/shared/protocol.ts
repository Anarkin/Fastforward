import type { PdfPlace } from '../../../shared/pdf';
import type { ColumnWidths, FileColor, Sort, Sorts } from './settings';

export interface ComparedFile {
  readonly side: Side;
  readonly name: string;
}

export interface TextRow {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly cut?: true;
}

const textEncodings = [
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
}

export const sides = ['left', 'right'] as const;

export type Side = (typeof sides)[number];

export const parentFolder = '..';

export function isSide(value: unknown): value is Side {
  return sides.some((side) => side === value);
}

export type CommanderToHost =
  | {
      readonly type: 'open';
      readonly tab: string;
      readonly side: Side;
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
      readonly files: readonly [ComparedFile, ComparedFile];
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
      readonly name: string;
    }
  | {
      readonly type: 'shellMenu';
      readonly tab: string;
      readonly side: Side;
      readonly names: readonly string[];
      readonly x: number;
      readonly y: number;
      readonly extended: boolean;
    }
  | {
      readonly type: 'delete';
      readonly tab: string;
      readonly side: Side;
      readonly names: readonly string[];
      readonly permanently: boolean;
    }
  | { readonly type: 'reread'; readonly tab: string; readonly side: Side }
  | { readonly type: 'elevate'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'openRepository';
      readonly tab: string;
      readonly side: Side;
      readonly name: string;
    }
  | {
      readonly type: 'openOnSide';
      readonly tab: string;
      readonly from: Side;
      readonly side: Side;
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
  | { readonly type: 'dropIcons'; readonly tickets: readonly string[] };

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
      readonly thumbnailSize: number;
      readonly fileColors: readonly FileColor[];
    }
  | { readonly type: 'drives'; readonly drives: readonly string[] }
  | { readonly type: 'show'; readonly tab: string; readonly file?: string }
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
      readonly error?: string;
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
      readonly selected: string | undefined;
    }
  | {
      readonly type: 'repositories';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    };

export type CommanderToWebviewOf<T extends CommanderToWebview['type']> =
  Extract<CommanderToWebview, { readonly type: T }>;
