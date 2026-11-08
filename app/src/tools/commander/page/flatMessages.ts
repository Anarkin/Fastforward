import type { Entry } from '../shared/protocol';
import type { Sort } from '../shared/settings';
import type { FileColors } from './fileColors';

export interface FlatChoices {
  readonly sort: Sort;
  readonly showHidden: boolean;
  readonly fileColors: FileColors;
  readonly query: string;
}

export interface SlottedFolder {
  readonly under: string;
  readonly entries: readonly Entry[];
  readonly slots: readonly number[];
}

export type ToFlatWorker =
  | {
      readonly type: 'start';
      readonly pane: string;
      readonly walk: number;
      readonly choices: FlatChoices;
    }
  | {
      readonly type: 'files';
      readonly pane: string;
      readonly walk: number;
      readonly folders: readonly SlottedFolder[];
      readonly freed: readonly number[];
    }
  | {
      readonly type: 'choose';
      readonly pane: string;
      readonly walk: number;
      readonly choices: FlatChoices;
    }
  | { readonly type: 'drop'; readonly pane: string };

export interface FromFlatWorker {
  readonly type: 'order';
  readonly pane: string;
  readonly walk: number;
  readonly query: string;
  readonly order: Uint32Array;
  readonly shown: Uint32Array | undefined;
}
