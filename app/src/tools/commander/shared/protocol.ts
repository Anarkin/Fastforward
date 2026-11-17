import type { FolderCommand } from '../../../lib/shared/folderCommands';
import type { PackFormat, PackLevel, ZipCipher } from './packing';
import type { ColumnWidths } from './columnWidths';
import type { FileColor } from '../../../lib/shared/fileColors';
import type { Sort, Sorts } from './sorts';
import type { ClashAnswer, TransferView } from './transfers';
import { isSide, type Side } from './sides';

export const viewVersion = 1;

export interface ComparedFile {
  readonly side: Side;
  readonly folder: string;
  readonly name: string;
}

export interface Entry {
  readonly name: string;
  readonly folder: boolean;
  readonly link: boolean;
  readonly hidden: boolean;
  readonly size: number | undefined;
  readonly modified: number | undefined;
  readonly online?: true;
  readonly executable?: true;
  readonly counting?: true;
  readonly unreadFolders?: number;
}

export interface FlatFolder {
  readonly under: string;
  readonly entries: readonly Entry[];
}

export interface FlatProgress {
  readonly reading: boolean;
  readonly stopped: boolean;
  readonly folders: number;
  readonly failed: number;
}

export const parentFolder = '..';

export type CommanderToHost =
  | {
      readonly type: 'editFile';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'open';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'drive';
      readonly tab: string;
      readonly side: Side;
      readonly drive: string;
    }
  | { readonly type: 'listDrives' }
  | {
      readonly type: 'compare';
      readonly tab: string;
      readonly files:
        | readonly [ComparedFile, ComparedFile]
        | readonly [ComparedFile]
        | readonly [];
    }
  | {
      readonly type: 'view';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'shellMenu';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly x: number;
      readonly y: number;
      readonly extended: boolean;
    }
  | {
      readonly type: 'delete';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly permanently: boolean;
    }
  | {
      readonly type: 'transfer';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly target: string;
      readonly move: boolean;
      readonly existing?: 'replace' | 'skip';
    }
  | {
      readonly type: 'answerClash';
      readonly transfer: number;
      readonly asked: number;
      readonly answer: ClashAnswer;
      readonly all: boolean;
    }
  | {
      readonly type: 'newFolder';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'newFile';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'testArchives';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | {
      readonly type: 'pack';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly archive: string;
      readonly format: PackFormat;
      readonly level: PackLevel;
      readonly password?: string;
      readonly encryptNames?: boolean;
      readonly zipCipher?: ZipCipher;
      readonly volumeBytes?: number;
      readonly test?: boolean;
      readonly replace?: boolean;
    }
  | {
      readonly type: 'rename';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
      readonly to: string;
    }
  | {
      readonly type: 'copyToClipboard';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | {
      readonly type: 'drag';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | {
      readonly type: 'paste';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
    }
  | { readonly type: 'stopTransfer'; readonly transfer: number }
  | { readonly type: 'hideTransfer'; readonly transfer: number }
  | { readonly type: 'reread'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'flat';
      readonly tab: string;
      readonly side: Side;
      readonly flat: boolean;
    }
  | { readonly type: 'stopReading'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'countSizes';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
    }
  | { readonly type: 'elevate'; readonly tab: string; readonly side: Side }
  | {
      readonly type: 'openRepository';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'folderCommand';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name?: string;
      readonly command: FolderCommand;
    }
  | {
      readonly type: 'password';
      readonly ask: number;
      readonly password?: string;
    }
  | {
      readonly type: 'updateArchive';
      readonly ask: number;
      readonly update: boolean;
    }
  | {
      readonly type: 'enterArchive';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
    }
  | {
      readonly type: 'openOnSide';
      readonly tab: string;
      readonly from: Side;
      readonly side: Side;
      readonly folder: string;
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
  | {
      readonly type: 'saveThumbnail';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly name: string;
      readonly box: number;
      readonly pixelRatio: number;
      readonly bytes: Uint8Array;
    }
  | { readonly type: 'showHidden'; readonly shown: boolean }
  | {
      readonly type: 'addBookmark';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
    }
  | { readonly type: 'removeBookmark'; readonly folder: string }
  | {
      readonly type: 'goToBookmark';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
    }
  | {
      readonly type: 'goTo';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly to: string;
    }
  | {
      readonly type: 'duplicates';
      readonly tab: string;
      readonly side: Side;
      readonly duplicates: boolean;
    }
  | { readonly type: 'dropIcons'; readonly tickets: readonly string[] };

export interface CommanderDrop {
  readonly type: 'drop';
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly into?: string;
  readonly move: boolean;
}

export function isDrop(message: unknown): message is CommanderDrop {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const field = (name: string): unknown => Reflect.get(message, name);
  const into = field('into');
  return (
    field('type') === 'drop' &&
    typeof field('tab') === 'string' &&
    isSide(field('side')) &&
    typeof field('folder') === 'string' &&
    (into === undefined || typeof into === 'string') &&
    typeof field('move') === 'boolean'
  );
}

export type CommanderToWebview =
  | {
      readonly type: 'settings';
      readonly showHidden: boolean;
      readonly sort: Sorts;
      readonly columns: ColumnWidths;
      readonly defaultColumns: ColumnWidths;
      readonly canElevate: boolean;
      readonly platform: string;
      readonly thumbnailSize: number;
      readonly fileColors: readonly FileColor[];
      readonly bookmarks: readonly string[];
      readonly gitMissing?: true;
    }
  | { readonly type: 'drives'; readonly drives: readonly string[] }
  | { readonly type: 'transfer'; readonly view: TransferView | undefined }
  | {
      readonly type: 'show';
      readonly tab: string;
    }
  | { readonly type: 'hide' }
  | { readonly type: 'closed'; readonly tab: string }
  | {
      readonly type: 'noAccess';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly asAdministrator: boolean;
    }
  | {
      readonly type: 'listing';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly hidden: readonly boolean[];
      readonly entries: readonly Entry[];
      readonly parent: boolean;
      readonly back: boolean;
      readonly forward: boolean;
      readonly elevated: boolean;
      readonly binOff?: true;
      readonly archive?: string;
      readonly selected: string | undefined;
      readonly flat?: number;
      readonly duplicates?: number;
    }
  | {
      readonly type: 'duplicateGroups';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly look: number;
      readonly groups: readonly (readonly string[])[];
      readonly reading: boolean;
    }
  | {
      readonly type: 'folderSizes';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly entries: readonly Entry[];
    }
  | {
      readonly type: 'flatFiles';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly walk: number;
      readonly folders: readonly FlatFolder[];
      readonly progress: FlatProgress;
    }
  | {
      readonly type: 'askPassword';
      readonly ask: number;
      readonly name: string;
      readonly wrong: boolean;
    }
  | {
      readonly type: 'askUpdate';
      readonly ask: number;
      readonly name: string;
      readonly archive: string;
    }
  | {
      readonly type: 'askExisting';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly target: string;
      readonly move: boolean;
      readonly existing: readonly string[];
    }
  | {
      readonly type: 'reading';
      readonly tab: string;
      readonly side: Side;
      readonly reading: boolean;
    }
  | {
      readonly type: 'repositories';
      readonly tab: string;
      readonly side: Side;
      readonly folder: string;
      readonly names: readonly string[];
      readonly inRepository?: true;
    };

export type CommanderToWebviewOf<T extends CommanderToWebview['type']> =
  Extract<CommanderToWebview, { readonly type: T }>;
