import type { ScrollSettings } from '../../../lib/page/scrollSettings';

export interface WholePaths {
  readonly old: string;
  readonly new: string;
}

export interface DiffLook {
  readonly sideBySide: boolean;
  readonly wordWrap: boolean;
  readonly showWhitespace: boolean;
  readonly highlightSyntax: boolean;
  readonly highlightOccurrences?: boolean;
  readonly cells?: boolean;
  readonly scrolling: ScrollSettings;
  readonly root: string | undefined;
  readonly language: string | undefined;
  readonly wholePaths?: WholePaths;
  readonly note?: string;
}
