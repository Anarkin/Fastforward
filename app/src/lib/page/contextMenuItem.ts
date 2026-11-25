import type { Sentence } from '../shared/sentences';

export type MenuIcon =
  | 'sevenZip'
  | 'image'
  | 'terminal'
  | 'commander'
  | 'git'
  | 'viewer'
  | 'diff'
  | 'editor';

export type ContextMenuItem =
  | {
      readonly label: string;
      readonly sentence?: Sentence;
      readonly path?: boolean;
      readonly icon?: MenuIcon;
      readonly title?: Sentence;
      readonly keys?: string | undefined;
      readonly onClick?: () => void;
      readonly submenu?: readonly ContextMenuItem[];
      readonly filtered?: boolean;
      readonly disabled?: boolean;
      readonly struck?: boolean;
      readonly checked?: boolean;
      readonly onRemove?: () => void;
      readonly removeTitle?: string;
      readonly accessKey?: string;
      readonly showAccessKey?: boolean;
      readonly keywords?: string;
      readonly details?: readonly string[];
    }
  | { readonly separator: true };

export interface OpenMenu {
  readonly x: number;
  readonly y: number;
  readonly items: readonly ContextMenuItem[];
  readonly trigger?: string;
}
