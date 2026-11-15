import type { KeptFocus } from '../../../lib/page/keptFocus';
import { plainSearch } from '../../../lib/shared/searchOptions';
import type { FindQuery } from './editorFind';

export type EditorAsk = 'overwrite' | 'changed';

export interface KeptEditing {
  readonly finding: boolean;
  readonly replacing: boolean;
  readonly query: FindQuery;
  readonly replacement: string;
  readonly focus: KeptFocus | undefined;
}

export const noKeptEditing: KeptEditing = {
  finding: false,
  replacing: false,
  query: { text: '', options: plainSearch },
  replacement: '',
  focus: undefined,
};
