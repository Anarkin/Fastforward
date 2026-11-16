import type { Sentence } from '../../../lib/shared/sentences';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { PdfPlace } from './pdf';

export interface TextRow {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly cut?: true;
}

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export const maxRowsAsked = 1000;
export const maxFindLength = 1000;

export const wholeLineBytes = 64 * 1024;

export const maxPreviewBytes = 1024 * 1024;

export const maxBytesAsked = 64 * 1024;

export type ViewerToHost =
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
      readonly options: SearchOptions;
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
      readonly type: 'editViewed';
      readonly tab: string;
      readonly at: number;
      readonly encoding?: TextEncoding;
    };

export type ViewerToWebview =
  | { readonly type: 'show'; readonly tab: string; readonly file: string }
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
    };

export type ViewerToWebviewOf<T extends ViewerToWebview['type']> = Extract<
  ViewerToWebview,
  { readonly type: T }
>;
