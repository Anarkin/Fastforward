import { commanderKeymap } from './keymap';
import { clicked, type Click } from '../../../lib/shared/keymap';
import { parentFolder } from '../shared/protocol';
import { type Side } from '../shared/sides';
import { type IconSource } from '../shared/icons';
import { type Row } from './listing';
import { opens, pointedKeys, rangeKeys } from './rowKeys';
import type { Filter } from '../../../lib/shared/filter';
import type { FileColors } from '../../../lib/page/fileColors';
import { shownRowsOf } from './shownRows';
import { useCommanderActions, useCommanderNow } from './store';
import type { CommanderActions, CommanderState } from './state';
import { menuOfClick } from './paneKeys';

export interface PaneLook {
  readonly tab: string | undefined;
  readonly folder: string | undefined;
  readonly fileColors: FileColors;
  readonly gitMissing: boolean;
  readonly dateFormat: string;
  readonly filter: Filter;
}

export interface PaneItemProps {
  readonly side: Side;
  readonly row: Row;
  readonly index: number;
  readonly look: PaneLook;
  readonly pairsClick: (key: string, count: number) => boolean;
  readonly onMenu: (
    key: string | undefined,
    at: { readonly x: number; readonly y: number },
  ) => void;
}

export function iconSourceOf(
  side: Side,
  row: Row,
  { tab, folder }: Pick<PaneLook, 'tab' | 'folder'>,
): IconSource | undefined {
  return tab === undefined ||
    folder === undefined ||
    row.entry === undefined ||
    row.entry.folder
    ? undefined
    : { tab, side, folder, name: row.key };
}

interface Pressed extends Click {
  readonly detail: number;
  readonly clientX: number;
  readonly clientY: number;
  preventDefault(): void;
  stopPropagation(): void;
}

export function paneItemOf(
  { side, row, index, pairsClick, onMenu }: PaneItemProps,
  actions: CommanderActions,
  now: () => CommanderState,
) {
  const onSelect = (key: string) => actions.select(side, key);
  const onMark = (keys: readonly string[], marking: boolean) =>
    actions.mark(side, keys, marking);
  const onOpen = (name: string) => actions.open(side, name);
  const shown = () => {
    const state = now();
    const pane = state.view.panes[side];
    return {
      rows: shownRowsOf(state, side).rows,
      marked: pane?.marked,
      selected: pane?.selected,
    };
  };
  const itemEvents = {
    draggable: row.entry !== undefined,
    onDragStart: (event: React.DragEvent) => {
      event.preventDefault();
      const { rows, marked: marks } = shown();
      const names = pointedKeys(rows, row.key, marks);
      if (names.length > 0) {
        onSelect(row.key);
        actions.drag(side, names);
      }
    },
    onPointerDown: (event: Pressed) => {
      if (clicked(commanderKeymap.selectItem, event) !== undefined) {
        onSelect(row.key);
      }
    },
    onClick: (event: Pressed) => {
      const marking = clicked(commanderKeymap.markClick, event);
      const { rows, marked: marks, selected: selectedKey } = shown();
      if (marking === 'toggle') {
        onMark([row.key], !marks?.has(row.key));
      } else if (marking === 'range') {
        const selectedIndex = rows.findIndex(
          (each) => each.key === (selectedKey ?? ''),
        );
        if (selectedIndex !== -1) {
          onMark(rangeKeys(rows, selectedIndex, index), true);
        }
      }
      onSelect(row.key);
      if (pairsClick(row.key, event.detail) && opens(row)) {
        onOpen(row.key);
      }
    },
    onContextMenu: (event: Pressed) => {
      event.preventDefault();
      event.stopPropagation();
      const at = { x: event.clientX, y: event.clientY };
      onSelect(row.key);
      if (menuOfClick(event) === 'system') {
        const { rows, marked: marks } = shown();
        actions.shellMenu(
          side,
          row.key === parentFolder ? [] : pointedKeys(rows, row.key, marks),
          at,
          true,
        );
      } else {
        onMenu(row.key, at);
      }
    },
  };
  const toggleMark = () => onMark([row.key], !shown().marked?.has(row.key));
  return { itemEvents, toggleMark };
}

export function usePaneItem(props: PaneItemProps) {
  return paneItemOf(props, useCommanderActions(), useCommanderNow());
}
