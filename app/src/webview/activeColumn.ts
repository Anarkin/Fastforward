import { keymap } from '../shared/keymap';
import { keyPressed } from './shortcuts';

export type ColumnName = 'commits' | 'files' | 'diff';

export const columnOrder: readonly ColumnName[] = ['commits', 'files', 'diff'];

export const columnFocusAttribute = 'data-column-focus';

export function shownColumns(
  commitsShown: boolean,
  selected: string | undefined,
): ColumnName[] {
  return columnOrder.filter((column) =>
    column === 'commits' ? commitsShown : selected !== undefined,
  );
}

export function columnMove(
  event: Parameters<typeof keyPressed>[1],
): { readonly step: 1 | -1; readonly tab: boolean } | undefined {
  const move = keyPressed(keymap.column, event);
  return move === undefined
    ? undefined
    : {
        step: move === 'next' || move === 'right' ? 1 : -1,
        tab: move === 'next' || move === 'previous',
      };
}

export function forwardedColumn(
  column: ColumnName | undefined,
  event: Parameters<typeof keyPressed>[1],
): ColumnName | undefined {
  return column === 'files' && keyPressed(keymap.change, event) !== undefined
    ? 'diff'
    : undefined;
}

export function adjacentColumn(
  shown: readonly ColumnName[],
  current: ColumnName | undefined,
  step: 1 | -1,
): ColumnName | undefined {
  const index = current === undefined ? -1 : shown.indexOf(current);
  if (index === -1) {
    return shown.at(0);
  }
  return shown[index + step];
}

interface ColumnElement {
  readonly parentElement: { readonly children: ArrayLike<unknown> } | null;
}

export function columnOf(
  target: { closest(selector: string): ColumnElement | null } | null,
): ColumnName | undefined {
  const column = target?.closest('.column');
  const siblings = column?.parentElement?.children;
  if (!column || !siblings) {
    return undefined;
  }
  return columnOrder[Array.from(siblings).indexOf(column)];
}
