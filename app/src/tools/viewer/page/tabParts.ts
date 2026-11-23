import type { KeptFocus } from '../../../lib/page/viewFocus';
import { noSearch, type Search } from '../../../lib/shared/searchOptions';
import type { ByteRange, TextRow } from '../shared/protocol';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { ColoredText, WholeText } from './textColors';
import type { KeptViewerSelection } from './tabSelection';

export interface ViewerFound extends Search {
  readonly encoding: TextEncoding;
  readonly version: string | undefined;
  readonly matches: readonly ByteRange[];
  readonly done: boolean;
}

interface KeptRows {
  readonly encoding: TextEncoding;
  readonly version: string | undefined;
  readonly rows: readonly TextRow[];
  readonly top: { readonly index: number; readonly from: number };
}

interface KeptText {
  readonly encoding: TextEncoding;
  readonly version: string | undefined;
  readonly text: WholeText;
}

interface KeptColors {
  readonly language: string;
  readonly whole: WholeText;
  readonly colored: ColoredText;
  readonly done: boolean;
}

export interface KeptBytes {
  readonly version: string | undefined;
  readonly start: number;
  readonly data: readonly number[];
  readonly asked: number;
}

interface KeptSideways {
  readonly body: string;
  readonly left: number;
  readonly column: number;
}

interface KeptPreview {
  readonly top: number;
  readonly left: number;
  readonly block?: number;
  readonly offset: number;
}

interface KeptPdfFind {
  readonly search: Search;
  readonly current: number;
}

export interface KeptViewer {
  readonly finding: boolean;
  readonly pdfFind: KeptPdfFind | undefined;
  readonly markdownFind: KeptPdfFind | undefined;
  readonly search: Search;
  readonly current: number;
  readonly found: ViewerFound | undefined;
  readonly focus: KeptFocus | undefined;
  readonly rows: KeptRows | undefined;
  readonly text: KeptText | undefined;
  readonly colors: KeptColors | undefined;
  readonly bytes: KeptBytes | undefined;
  readonly sideways: KeptSideways | undefined;
  readonly preview: KeptPreview | undefined;
  readonly selected: KeptViewerSelection | undefined;
}

export type ViewerTabView = Omit<
  KeptViewer,
  'found' | 'rows' | 'text' | 'colors' | 'bytes'
>;

export const maxCachedViewers = 3;

export const withoutCaches = (
  kept: Partial<KeptViewer>,
): Partial<KeptViewer> => {
  const {
    found: _found,
    rows: _rows,
    text: _text,
    colors: _colors,
    bytes: _bytes,
    ...cheap
  } = kept;
  return cheap;
};

const cacheNames = ['found', 'rows', 'text', 'colors', 'bytes'] as const;

export const cachesOf = (kept: Partial<KeptViewer>): Partial<KeptViewer> =>
  Object.fromEntries(
    cacheNames.flatMap((name) => (name in kept ? [[name, kept[name]]] : [])),
  );

export const noKeptViewer: KeptViewer = {
  finding: false,
  pdfFind: undefined,
  markdownFind: undefined,
  search: noSearch,
  current: 0,
  found: undefined,
  focus: undefined,
  rows: undefined,
  text: undefined,
  colors: undefined,
  bytes: undefined,
  sideways: undefined,
  preview: undefined,
  selected: undefined,
};
