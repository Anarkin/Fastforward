import type { DiffLayout } from './protocol';

export interface GitSettings {
  readonly collapseMerges: boolean;
  readonly showAllFiles: boolean;
  readonly entireFilePinned: boolean;
  readonly ignoreWhitespace: boolean;
  readonly wordWrap: boolean;
  readonly showWhitespace: boolean;
  readonly diffLayout: DiffLayout;
  readonly solo: boolean;
  readonly autoFetch: boolean;
  readonly autoFetchMinutes: number;
  readonly hideDimmedButtons: boolean;
  readonly columnWidths: readonly number[];
}
