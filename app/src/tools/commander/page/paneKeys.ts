import {
  clicked,
  keymap,
  letterTyped,
  type Click,
} from '../../../shell/shared/keymap';
import {
  listMoveOf,
  moveInList,
  type VisibleRows,
} from '../../../ui/listMoves';
import { keyPressed } from '../../../ui/shortcuts';
import { commanderKeymap } from '../shared/keymap';
import { parentFolder, type Side } from '../shared/protocol';
import {
  chosenKeys,
  namesIgnoreCase,
  opens,
  passedKeys,
  type Row,
} from './listing';
import type { Copied } from './naming';
import { moveInGrid } from './tiles';

export type PaneAct =
  | { readonly kind: 'newFolder' }
  | { readonly kind: 'rename'; readonly name: string }
  | { readonly kind: 'pack'; readonly names: readonly string[] }
  | { readonly kind: 'test'; readonly names: readonly string[] }
  | { readonly kind: 'enterArchive'; readonly name: string }
  | { readonly kind: 'copyToClipboard'; readonly names: readonly string[] }
  | { readonly kind: 'paste' }
  | {
      readonly kind: 'copyText';
      readonly copied: Copied;
      readonly names: readonly string[];
    }
  | {
      readonly kind: 'transfer';
      readonly names: readonly string[];
      readonly move: boolean;
    }
  | {
      readonly kind: 'delete';
      readonly names: readonly string[];
      readonly permanently: boolean;
    }
  | { readonly kind: 'menu'; readonly key: string | undefined }
  | { readonly kind: 'filterLetter'; readonly letter: string }
  | { readonly kind: 'openFilter' }
  | { readonly kind: 'stopFiltering' }
  | { readonly kind: 'stopReading' }
  | { readonly kind: 'switchSide' }
  | { readonly kind: 'compare' }
  | { readonly kind: 'view'; readonly name: string }
  | { readonly kind: 'edit'; readonly name: string }
  | { readonly kind: 'openOnSide'; readonly side: Side; readonly name: string }
  | { readonly kind: 'open'; readonly name: string }
  | {
      readonly kind: 'mark';
      readonly keys: readonly string[];
      readonly marked: boolean;
      readonly select: string;
      readonly count?: readonly string[];
    }
  | { readonly kind: 'countSizes'; readonly names: readonly string[] }
  | {
      readonly kind: 'markPattern';
      readonly mark: boolean;
      readonly suggested: string;
    }
  | {
      readonly kind: 'invertMarks';
      readonly marking: readonly string[];
      readonly unmarking: readonly string[];
    }
  | { readonly kind: 'select'; readonly key: string };

export interface PaneKeys {
  readonly rows: readonly Row[];
  readonly selected: string | undefined;
  readonly selectedIndex: number;
  readonly marked: ReadonlySet<string> | undefined;
  readonly filtering: boolean;
  readonly reading: boolean;
  readonly parent: boolean;
  readonly tiled: boolean;
  readonly across: number;
  readonly visible: VisibleRows;
  readonly platform: string | undefined;
}

const done = {};

function uncounted(row: Row): boolean {
  return row.entry?.folder === true && row.entry.size === undefined;
}

export function menuOfClick(click: Click): 'system' | 'app' {
  return clicked(commanderKeymap.systemMenu, click) === undefined
    ? 'app'
    : 'system';
}

export function paneKey(
  event: Parameters<typeof keyPressed>[1],
  {
    rows,
    selected,
    selectedIndex,
    marked,
    filtering,
    reading,
    parent,
    tiled,
    across,
    visible,
    platform,
  }: PaneKeys,
): { readonly act?: PaneAct } | undefined {
  const row = selectedIndex === -1 ? undefined : rows[selectedIndex];
  if (keyPressed(commanderKeymap.newFolder, event) !== undefined) {
    return { act: { kind: 'newFolder' } };
  }
  if (keyPressed(commanderKeymap.copyToClipboard, event) !== undefined) {
    const names = chosenKeys(rows, selected, marked);
    return names.length > 0
      ? { act: { kind: 'copyToClipboard', names } }
      : done;
  }
  if (keyPressed(commanderKeymap.paste, event) !== undefined) {
    return { act: { kind: 'paste' } };
  }
  const copied =
    keyPressed(commanderKeymap.copyPaths, event) ??
    keyPressed(commanderKeymap.copyNames, event);
  if (copied !== undefined) {
    return {
      act: {
        kind: 'copyText',
        copied,
        names: chosenKeys(rows, selected, marked),
      },
    };
  }
  if (keyPressed(commanderKeymap.renameItem, event) !== undefined) {
    return row?.entry === undefined
      ? done
      : { act: { kind: 'rename', name: row.key } };
  }
  if (keyPressed(commanderKeymap.testArchives, event) !== undefined) {
    const names = chosenKeys(rows, selected, marked);
    return names.length > 0 ? { act: { kind: 'test', names } } : done;
  }
  if (keyPressed(commanderKeymap.countSizes, event) !== undefined) {
    const names = rows.filter(uncounted).map((each) => each.key);
    return names.length > 0 ? { act: { kind: 'countSizes', names } } : done;
  }
  if (keyPressed(commanderKeymap.packItems, event) !== undefined) {
    const names = chosenKeys(rows, selected, marked);
    return names.length > 0 ? { act: { kind: 'pack', names } } : done;
  }
  const moving = keyPressed(commanderKeymap.transferItems, event);
  if (moving !== undefined) {
    const names = chosenKeys(rows, selected, marked);
    return names.length > 0
      ? { act: { kind: 'transfer', names, move: moving } }
      : done;
  }
  const permanently = keyPressed(commanderKeymap.deleteItems, event);
  if (permanently !== undefined) {
    const names = chosenKeys(rows, selected, marked);
    return names.length > 0
      ? { act: { kind: 'delete', names, permanently } }
      : done;
  }
  if (keyPressed(commanderKeymap.contextMenu, event) !== undefined) {
    return { act: { kind: 'menu', key: row?.key } };
  }
  const letter =
    keyPressed(keymap.mainMenu, event) === undefined &&
    keyPressed(commanderKeymap.filterLetter, event) !== undefined
      ? letterTyped(event)
      : undefined;
  if (letter !== undefined) {
    return { act: { kind: 'filterLetter', letter } };
  }
  if (keyPressed(commanderKeymap.filter, event) !== undefined) {
    return { act: { kind: 'openFilter' } };
  }
  if (
    filtering &&
    keyPressed(commanderKeymap.stopFiltering, event) !== undefined
  ) {
    return { act: { kind: 'stopFiltering' } };
  }
  if (reading && keyPressed(commanderKeymap.stopReading, event) !== undefined) {
    return { act: { kind: 'stopReading' } };
  }
  if (keyPressed(commanderKeymap.side, event) !== undefined) {
    return { act: { kind: 'switchSide' } };
  }
  if (keyPressed(commanderKeymap.compare, event) !== undefined) {
    return { act: { kind: 'compare' } };
  }
  if (keyPressed(commanderKeymap.view, event) !== undefined) {
    return row?.entry !== undefined && !row.entry.folder
      ? { act: { kind: 'view', name: row.key } }
      : done;
  }
  if (keyPressed(commanderKeymap.edit, event) !== undefined) {
    return row?.entry !== undefined
      ? { act: { kind: 'edit', name: row.key } }
      : done;
  }
  const side = keyPressed(commanderKeymap.openOnSide, event);
  if (side !== undefined) {
    return row === undefined
      ? done
      : { act: { kind: 'openOnSide', side, name: row.key } };
  }
  if (keyPressed(commanderKeymap.parentFolder, event) !== undefined) {
    return parent ? { act: { kind: 'open', name: parentFolder } } : done;
  }
  if (keyPressed(commanderKeymap.openWithSevenZip, event) !== undefined) {
    return row?.entry !== undefined && !row.entry.folder
      ? { act: { kind: 'enterArchive', name: row.key } }
      : done;
  }
  if (keyPressed(commanderKeymap.openFolder, event) !== undefined) {
    return row !== undefined && opens(row)
      ? { act: { kind: 'open', name: row.key } }
      : undefined;
  }
  const marking = keyPressed(commanderKeymap.markMoving, event);
  if (marking !== undefined) {
    const sideways = marking === 'left' || marking === 'right';
    if (row === undefined || (sideways && !tiled)) {
      return done;
    }
    const moved = tiled
      ? moveInGrid(marking, selectedIndex, rows.length, across, visible)
      : marking === 'left' || marking === 'right'
        ? undefined
        : moveInList(marking, selectedIndex, rows.length, visible);
    if (moved === undefined && event.repeat) {
      return done;
    }
    const next = moved ?? selectedIndex;
    return {
      act: {
        kind: 'mark',
        keys: passedKeys(rows, selectedIndex, next),
        marked: !marked?.has(row.key),
        select: rows[next].key,
      },
    };
  }
  const byExtension = keyPressed(commanderKeymap.markExtension, event);
  if (byExtension !== undefined) {
    if (row?.entry === undefined || row.entry.folder) {
      return done;
    }
    const keyOf = (extension: string) =>
      namesIgnoreCase(platform) ? extension.toLowerCase() : extension;
    const extension = keyOf(row.extension);
    return {
      act: {
        kind: 'mark',
        keys: rows.flatMap((each) =>
          each.entry !== undefined &&
          !each.entry.folder &&
          keyOf(each.extension) === extension
            ? [each.key]
            : [],
        ),
        marked: byExtension,
        select: row.key,
      },
    };
  }
  const byPattern = keyPressed(commanderKeymap.markPattern, event);
  if (byPattern !== undefined) {
    return {
      act: {
        kind: 'markPattern',
        mark: byPattern,
        suggested:
          row?.entry !== undefined && row.extension !== ''
            ? `*.${row.extension}`
            : '*',
      },
    };
  }
  if (keyPressed(commanderKeymap.invertMarks, event) !== undefined) {
    const keys = rows.flatMap((each) =>
      each.entry === undefined ? [] : [each.key],
    );
    return {
      act: {
        kind: 'invertMarks',
        marking: keys.filter((key) => marked?.has(key) !== true),
        unmarking: keys.filter((key) => marked?.has(key) === true),
      },
    };
  }
  if (keyPressed(commanderKeymap.markAll, event) !== undefined) {
    const keys = rows.flatMap((each) =>
      each.entry === undefined ? [] : [each.key],
    );
    const [first] = keys;
    return first === undefined
      ? done
      : {
          act: {
            kind: 'mark',
            keys,
            marked: !keys.every((key) => marked?.has(key) === true),
            select: selected ?? first,
          },
        };
  }
  const counts = keyPressed(commanderKeymap.toggleMark, event);
  if (counts !== undefined) {
    if (row === undefined) {
      return done;
    }
    const marks = !marked?.has(row.key);
    return {
      act: {
        kind: 'mark',
        keys: [row.key],
        marked: marks,
        select: rows[Math.min(selectedIndex + 1, rows.length - 1)].key,
        ...(counts && marks && uncounted(row) && { count: [row.key] }),
      },
    };
  }
  const sideways = tiled
    ? keyPressed(commanderKeymap.moveAcross, event)
    : undefined;
  const move = listMoveOf(event);
  if (sideways === undefined && move === undefined) {
    return undefined;
  }
  const from = selectedIndex === -1 ? undefined : selectedIndex;
  const next =
    sideways !== undefined
      ? moveInGrid(sideways, from, rows.length, across, visible)
      : move === undefined
        ? undefined
        : tiled
          ? moveInGrid(move, from, rows.length, across, visible)
          : moveInList(move, from, rows.length, visible);
  return next === undefined
    ? done
    : { act: { kind: 'select', key: rows[next].key } };
}
