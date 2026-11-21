import { closeTip } from '../../../lib/page/closeTip';
import { lineHeightOf } from '../../../lib/page/lineHeight';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clicked, shortcutOf } from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';
import { strings } from '../../../lib/shared/strings';
import { listenForDismiss } from '../../../lib/page/dismiss';
import { scrollbarCoverClass } from '../../../lib/page/scrollbars';

const pinKeptBy = `.${scrollbarCoverClass}, [role="tablist"]`;

function isNode(target: EventTarget | null): target is Node {
  return target !== null && 'nodeType' in target;
}

function isElement(target: EventTarget | null): target is Element {
  return isNode(target) && 'closest' in target;
}
import { CloseIcon, PinIcon } from '../../../lib/page/icons';
import { KeyCombo } from '../../../lib/page/keyCombo';
import { type PeekAnchor, nextLift, hiddenLines } from './messageHolding';

export function MessagePanel({
  anchor,
  indent,
  onUnpin,
  takesKeyboard = false,
  children,
}: {
  anchor: PeekAnchor;
  indent: number;
  onUnpin?: () => void;
  takesKeyboard?: boolean;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(0);
  useEffect(() => {
    if (!onUnpin) {
      return undefined;
    }
    const pressed = ({ target }: Event) => {
      if (
        isNode(target) &&
        !panel.current?.contains(target) &&
        !(isElement(target) && target.closest(pinKeptBy) !== null)
      ) {
        onUnpin();
      }
    };
    window.addEventListener('pointerdown', pressed, { capture: true });
    const dismissed = listenForDismiss(window, panel, onUnpin, {
      byKeyOnly: true,
    });
    return () => {
      window.removeEventListener('pointerdown', pressed, { capture: true });
      dismissed();
    };
  }, [onUnpin]);
  useEffect(() => {
    const element = panel.current;
    if (!takesKeyboard || !element) {
      return undefined;
    }
    const previous = element.ownerDocument.activeElement;
    const scroller =
      element.querySelector<HTMLElement>('.message-body') ?? element;
    scroller.focus({ preventScroll: true });
    return () => {
      const active = element.ownerDocument.activeElement;
      if (
        previous instanceof HTMLElement &&
        (active === null ||
          active === element.ownerDocument.body ||
          element.contains(active))
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [takesKeyboard]);
  useLayoutEffect(() => {
    const box = panel.current?.getBoundingClientRect();
    if (box) {
      const lift = nextLift(lifted, box, anchor.room, window.devicePixelRatio);
      if (lift !== undefined) {
        setLifted(lift);
      }
    }
  }, [anchor, lifted]);
  return (
    <div
      ref={panel}
      className={onUnpin ? 'message-peek pinned' : 'message-peek'}
      role="tooltip"
      tabIndex={-1}
      style={{
        left: anchor.left - indent,
        top: anchor.top - lifted,
        maxHeight: anchor.room.bottom - anchor.room.top,
        '--peek-row-width': `${anchor.width}px`,
      }}
      onClickCapture={(event) => {
        if (onUnpin && clicked(gitKeymap.pin, event) !== undefined) {
          event.stopPropagation();
          onUnpin();
        }
      }}
    >
      {children}
    </div>
  );
}

export function MessageCorner({
  onUnpin,
  byKeys = false,
}: {
  onUnpin?: () => void;
  byKeys?: boolean;
}) {
  const keys = shortcutOf(gitKeymap.pin, byKeys ? 'keyboard' : 'pointer') ?? '';
  return (
    <span className={onUnpin ? 'message-corner pinned' : 'message-corner'}>
      <span className="message-hint">
        <PinIcon />
        <KeyCombo keys={keys} />
      </span>
      <button
        className="message-close"
        {...closeTip}
        disabled={!onUnpin}
        onClick={onUnpin}
      >
        <CloseIcon />
      </button>
    </span>
  );
}

export function MessageBody({ text }: { text: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  useLayoutEffect(() => {
    const element = body.current;
    const style = element?.ownerDocument.defaultView?.getComputedStyle(element);
    setHidden(
      element && style?.overflowY === 'hidden'
        ? hiddenLines(
            element.scrollHeight,
            element.clientHeight,
            lineHeightOf(
              element,
              0,
              element.ownerDocument.defaultView?.devicePixelRatio ?? 1,
            ),
          )
        : 0,
    );
  }, []);
  if (text === '') {
    return null;
  }
  return (
    <>
      <div ref={body} className="message-body" tabIndex={-1}>
        {text}
      </div>
      {hidden > 0 && (
        <div className="message-more">{strings.commits.moreLines(hidden)}</div>
      )}
    </>
  );
}
