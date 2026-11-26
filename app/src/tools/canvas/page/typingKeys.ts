import { keyPressed, type KeyEvent } from '../../../lib/page/shortcuts';
import { canvasKeymap } from './keymap';
import type { TypedLayout } from './typedLayout';
import {
  allSelected,
  deleted,
  inserted,
  movedAcross,
  movedRows,
  movedTo,
  movedToRowEdge,
  type Caret,
} from './typing';

export type Keyed =
  { readonly kind: 'caret'; readonly caret: Caret } | { readonly kind: 'stop' };

const forwardOf = (way: string) => way === 'right' || way === 'selectRight';

const downOf = (way: string) => way === 'down' || way === 'selectDown';

const selectsOf = (way: string) => way.startsWith('select');

function sideways(event: KeyEvent, caret: Caret): Caret | undefined {
  const character = keyPressed(canvasKeymap.cursorCharacter, event);
  if (character !== undefined) {
    return movedAcross(
      caret,
      forwardOf(character),
      false,
      selectsOf(character),
    );
  }
  const word = keyPressed(canvasKeymap.cursorWord, event);
  return word === undefined
    ? undefined
    : movedAcross(caret, forwardOf(word), true, selectsOf(word));
}

function upAndDown(
  event: KeyEvent,
  caret: Caret,
  layout: TypedLayout | undefined,
): Caret | undefined {
  const end = keyPressed(canvasKeymap.cursorTextEnd, event);
  if (end !== undefined) {
    return movedTo(caret, downOf(end) ? caret.text.length : 0, selectsOf(end));
  }
  if (layout === undefined) {
    return undefined;
  }
  const wrapping = { columns: layout.area.wrapAt, widths: layout.widths };
  const row = keyPressed(canvasKeymap.cursorRow, event);
  if (row !== undefined) {
    return movedRows(caret, wrapping, downOf(row), selectsOf(row));
  }
  const start = keyPressed(canvasKeymap.rowStart, event);
  if (start !== undefined) {
    return movedToRowEdge(caret, wrapping, false, start === 'select');
  }
  const last = keyPressed(canvasKeymap.rowEnd, event);
  return last === undefined
    ? undefined
    : movedToRowEdge(caret, wrapping, true, last === 'select');
}

function edited(event: KeyEvent, caret: Caret): Caret | undefined {
  if (keyPressed(canvasKeymap.newLine, event) !== undefined) {
    return inserted(caret, '\n');
  }
  const character = keyPressed(canvasKeymap.deleteCharacter, event);
  if (character !== undefined) {
    return deleted(caret, character > 0, false);
  }
  const word = keyPressed(canvasKeymap.deleteWord, event);
  if (word !== undefined) {
    return deleted(caret, word > 0, true);
  }
  return keyPressed(canvasKeymap.selectAllText, event) === undefined
    ? undefined
    : allSelected(caret);
}

export function typingKeyed(
  event: KeyEvent,
  caret: Caret,
  layout: TypedLayout | undefined,
  oneLine = false,
): Keyed | undefined {
  if (
    keyPressed(canvasKeymap.stopTyping, event) !== undefined ||
    (oneLine && keyPressed(canvasKeymap.newLine, event) !== undefined)
  ) {
    return { kind: 'stop' };
  }
  const next =
    edited(event, caret) ??
    sideways(event, caret) ??
    upAndDown(event, caret, layout);
  return next === undefined ? undefined : { kind: 'caret', caret: next };
}
