import {
  useCallback,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import {
  textContextIn,
  type CharacterBoundsUpdate,
  type TextContext,
} from '../../../lib/page/textContext';
import type { Typing } from './state';
import { spanOf, type Caret } from './typing';

export interface ClientBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const rectOf = ({ left, top, width, height }: ClientBox) =>
  new DOMRect(left, top, width, height);

export function useTypingContext(
  element: RefObject<HTMLElement | null>,
  typing: Typing | undefined,
  typed: (caret: Caret) => void,
): (caret: ClientBox | undefined, control: ClientBox) => void {
  const context = useRef<TextContext>(undefined);
  const bounds = useRef<ClientBox>(undefined);
  const session = typing?.session;
  const started = useEffectEvent(() => typing);
  const updated = useEffectEvent(() => {
    const made = context.current;
    if (made !== undefined) {
      typed({
        text: made.text,
        anchor: made.selectionStart,
        head: made.selectionEnd,
      });
    }
  });
  const bounded = useEffectEvent((event: CharacterBoundsUpdate) => {
    const made = context.current;
    const at = bounds.current;
    if (made !== undefined && at !== undefined) {
      made.updateCharacterBounds(
        event.rangeStart,
        Array.from({ length: event.rangeEnd - event.rangeStart }, () =>
          rectOf(at),
        ),
      );
    }
  });

  useLayoutEffect(() => {
    const host = element.current;
    const start = started();
    if (host === null || session === undefined || start === undefined) {
      return undefined;
    }
    const { from, to } = spanOf(start);
    const made = textContextIn(host, {
      text: start.text,
      selectionStart: from,
      selectionEnd: to,
    });
    if (made === undefined) {
      return undefined;
    }
    const onUpdate = () => updated();
    const onBounds = (event: CharacterBoundsUpdate) => bounded(event);
    made.addEventListener('textupdate', onUpdate);
    made.addEventListener('characterboundsupdate', onBounds);
    context.current = made;
    return () => {
      made.removeEventListener('textupdate', onUpdate);
      made.removeEventListener('characterboundsupdate', onBounds);
      if (host.editContext === made) {
        host.editContext = null;
      }
      context.current = undefined;
    };
  }, [element, session]);

  useLayoutEffect(() => {
    const made = context.current;
    if (made === undefined || typing === undefined) {
      return;
    }
    if (made.text !== typing.text) {
      made.updateText(0, made.text.length, typing.text);
    }
    const { from, to } = spanOf(typing);
    if (made.selectionStart !== from || made.selectionEnd !== to) {
      made.updateSelection(from, to);
    }
  }, [typing]);

  return useCallback((caret: ClientBox | undefined, control: ClientBox) => {
    bounds.current = caret;
    const made = context.current;
    if (made === undefined) {
      return;
    }
    made.updateControlBounds(rectOf(control));
    if (caret !== undefined) {
      made.updateSelectionBounds(rectOf(caret));
    }
  }, []);
}
