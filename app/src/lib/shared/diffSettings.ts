import type { DiffLayout } from './changes';

export interface DiffSettings {
  readonly diffLayout: DiffLayout;
  readonly ignoreWhitespace: boolean;
  readonly showEntireFile: boolean;
}
