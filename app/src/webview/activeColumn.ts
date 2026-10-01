import { changeStep } from './shortcuts';

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

const fields = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function columnStep(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'defaultPrevented'
  > & { readonly target: { readonly tagName?: string } | null },
): 1 | -1 | undefined {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return undefined;
  }
  if (event.key === 'Tab') {
    return event.shiftKey ? -1 : 1;
  }
  if (event.shiftKey || fields.has(event.target?.tagName ?? '')) {
    return undefined;
  }
  return event.key === 'ArrowRight'
    ? 1
    : event.key === 'ArrowLeft'
      ? -1
      : undefined;
}

export function forwardedColumn(
  column: ColumnName | undefined,
  event: Pick<
    KeyboardEvent,
    | 'key'
    | 'code'
    | 'ctrlKey'
    | 'metaKey'
    | 'altKey'
    | 'shiftKey'
    | 'defaultPrevented'
  >,
): ColumnName | undefined {
  return column === 'files' &&
    !event.defaultPrevented &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    changeStep(event) !== undefined
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
