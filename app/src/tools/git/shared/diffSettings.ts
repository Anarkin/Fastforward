import type { DiffLayout } from './protocol';

export interface DiffSettings {
  readonly diffLayout: DiffLayout;
  readonly ignoreWhitespace: boolean;
  readonly showEntireFile: boolean;
}
