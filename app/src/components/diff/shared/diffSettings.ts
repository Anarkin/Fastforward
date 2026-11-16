import type { DiffLayout } from './diffProtocol';

export interface DiffSettings {
  readonly diffLayout: DiffLayout;
  readonly ignoreWhitespace: boolean;
  readonly showEntireFile: boolean;
}
