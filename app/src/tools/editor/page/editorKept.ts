import type { KeptFocus, KeptTyped } from '../../../lib/page/keptFocus';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { plainSearch } from '../../../lib/shared/searchOptions';
import type { FindQuery } from './editorFind';

export type EditorAsk = 'overwrite' | 'changed';

export interface KeptEditing {
  readonly finding: boolean;
  readonly replacing: boolean;
  readonly query: FindQuery;
  readonly replacement: string;
  readonly focus: KeptFocus | undefined;
  readonly goingToLine?: KeptTyped;
  readonly reopening?: TextEncoding | 'auto';
}

export const noKeptEditing: KeptEditing = {
  finding: false,
  replacing: false,
  query: { text: '', options: plainSearch },
  replacement: '',
  focus: undefined,
};
