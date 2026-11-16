import type { ScrollSettings } from './scrollSettings';

export interface DiffLook {
  readonly sideBySide: boolean;
  readonly wordWrap: boolean;
  readonly showWhitespace: boolean;
  readonly highlightSyntax: boolean;
  readonly scrolling: ScrollSettings;
  readonly root: string | undefined;
  readonly language: string | undefined;
}
