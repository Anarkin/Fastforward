import type { ColumnWidths, Sort, Sorts } from './settings';

export interface Entry {
  readonly name: string;
  readonly folder: boolean;
  readonly link: boolean;
  readonly hidden: boolean;
  readonly size: number | undefined;
  readonly modified: number | undefined;
}

export const sides = ['left', 'right'] as const;

export type Side = (typeof sides)[number];

export const parentFolder = '..';

export function isSide(value: unknown): value is Side {
  return sides.some((side) => side === value);
}

export type CommanderToHost =
  | {
      readonly type: 'open';
      readonly tab: string;
      readonly side: Side;
      readonly name: string;
    }
  | {
      readonly type: 'drive';
      readonly tab: string;
      readonly side: Side;
      readonly drive: string;
    }
  | { readonly type: 'listDrives' }
  | { readonly type: 'elevate'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'openOnSide';
      readonly tab: string;
      readonly from: Side;
      readonly side: Side;
      readonly name: string;
    }
  | {
      readonly type: 'step';
      readonly tab: string;
      readonly side: Side;
      readonly step: -1 | 1;
    }
  | { readonly type: 'activate'; readonly tab: string; readonly side: Side }
  | { readonly type: 'columns'; readonly columns: ColumnWidths }
  | { readonly type: 'sort'; readonly side: Side; readonly sort: Sort }
  | { readonly type: 'showHidden'; readonly shown: boolean };

export type CommanderToWebview =
  | {
      readonly type: 'settings';
      readonly showHidden: boolean;
      readonly sort: Sorts;
      readonly columns: ColumnWidths;
      readonly defaultColumns: ColumnWidths;
      readonly canElevate: boolean;
    }
  | { readonly type: 'drives'; readonly drives: readonly string[] }
  | { readonly type: 'show'; readonly tab: string }
  | { readonly type: 'hide' }
  | {
      readonly type: 'noAccess';
      readonly side: Side;
      readonly folder: string;
      readonly asAdministrator: boolean;
    }
  | {
      readonly type: 'listing';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly entries: readonly Entry[];
      readonly parent: boolean;
      readonly back: boolean;
      readonly forward: boolean;
      readonly elevated: boolean;
      readonly selected: string | undefined;
    };

export type CommanderToWebviewOf<T extends CommanderToWebview['type']> =
  Extract<CommanderToWebview, { readonly type: T }>;
