import type { Sentence } from '../../../lib/shared/sentences';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { KeptBytes, LineEnding, StrayEnding } from './textMarks';

export const viewVersion = 1;

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

export type EditorToHost =
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
      readonly state: string;
    }
  | {
      readonly type: 'saveText';
      readonly tab: string;
      readonly overwriteReadOnly?: true;
      readonly overwriteChanged?: true;
    }
  | { readonly type: 'reloadEdited'; readonly tab: string }
  | {
      readonly type: 'viewEdited';
      readonly tab: string;
      readonly at: number;
      readonly save?: true;
      readonly discard?: true;
    }
  | {
      readonly type: 'saveIn';
      readonly tab: string;
      readonly encoding: TextEncoding | 'auto';
      readonly bom: boolean;
    }
  | {
      readonly type: 'reopenIn';
      readonly tab: string;
      readonly encoding: TextEncoding | 'auto';
    }
  | {
      readonly type: 'editSource';
      readonly tab: string;
      readonly file: string;
    };

export type EditorToWebview =
  | { readonly type: 'show'; readonly tab: string; readonly file: string }
  | { readonly type: 'hide' }
  | { readonly type: 'closed'; readonly tab: string }
  | { readonly type: 'settings'; readonly closeBrackets: boolean }
  | {
      readonly type: 'editing';
      readonly tab: string;
      readonly file: string;
      readonly version?: number;
      readonly encoding?: TextEncoding;
      readonly bom?: true;
      readonly onDisk?: {
        readonly encoding: TextEncoding;
        readonly bom: boolean;
      };
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
      readonly state?: string;
      readonly reloaded?: true;
      readonly at?: number;
    }
  | {
      readonly type: 'textChanged';
      readonly tab: string;
      readonly changed: boolean;
    }
  | { readonly type: 'askOverwrite'; readonly tab: string }
  | { readonly type: 'askChangedOnDisk'; readonly tab: string };

export type EditorToWebviewOf<T extends EditorToWebview['type']> = Extract<
  EditorToWebview,
  { readonly type: T }
>;
