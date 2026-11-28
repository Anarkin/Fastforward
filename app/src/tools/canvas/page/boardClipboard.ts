import { useEffectEvent, useLayoutEffect, type RefObject } from 'react';
import { placedFrom } from './boardPaint';
import { watchClipboard } from './focusedClipboard';
import type { Cell } from './routes';
import { boardShown } from './state';
import { useCanvas, useCanvasActions } from './store';
import type { Drawn } from './surface';
import { typesOneLine } from './typedTexts';
import { inserted, selectedText } from './typing';

export function useBoardClipboard(
  body: RefObject<HTMLElement | null>,
  drawn: RefObject<Drawn | undefined>,
  lastAt: RefObject<Cell | undefined>,
): void {
  const tab = useCanvas((state) => state.tab);
  const board = useCanvas((state) => boardShown(state)?.board);
  const { typingOf, typed, pasteOnBoard } = useCanvasActions();

  const copied = (event: ClipboardEvent, cut: boolean) => {
    const now = tab === undefined ? undefined : typingOf(tab);
    const text = now === undefined ? '' : selectedText(now);
    if (tab === undefined || now === undefined || text === '') {
      return;
    }
    event.preventDefault();
    event.clipboardData?.setData('text/plain', text);
    if (cut) {
      typed(tab, inserted(now, ''));
    }
  };

  const pasted = (event: ClipboardEvent) => {
    const now = tab === undefined ? undefined : typingOf(tab);
    const pastedText = event.clipboardData?.getData('text/plain') ?? '';
    const known = drawn.current;
    const at = placedFrom(known, lastAt.current);
    if (now === undefined && tab !== undefined && known && at) {
      if (pasteOnBoard(tab, pastedText, at, known.unit)) {
        event.preventDefault();
      }
      return;
    }
    const text = typesOneLine(board, now?.id)
      ? pastedText.replaceAll(/[\r\n]+/g, ' ')
      : pastedText;
    if (tab === undefined || now === undefined || text === '') {
      return;
    }
    event.preventDefault();
    typed(tab, inserted(now, text));
  };

  const onClipboard = useEffectEvent((event: ClipboardEvent) => {
    if (event.type === 'paste') {
      pasted(event);
    } else {
      copied(event, event.type === 'cut');
    }
  });

  useLayoutEffect(() => {
    const element = body.current;
    return element === null ? undefined : watchClipboard(element, onClipboard);
  }, [body]);
}
