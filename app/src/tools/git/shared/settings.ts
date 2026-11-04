import type { DiffLayout } from './protocol';

export interface GitSettings {
  readonly collapseMerges: boolean;
  readonly showAllFiles: boolean;
  readonly showEntireFile: boolean;
  readonly ignoreWhitespace: boolean;
  readonly diffLayout: DiffLayout;
  readonly solo: boolean;
  readonly autoFetch: boolean;
  readonly autoFetchMinutes: number;
  readonly hideDimmedButtons: boolean;
  readonly keepGitRunning: boolean;
  readonly columnWidths: readonly number[];
}
