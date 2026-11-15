import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clicked, shortcutOf } from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';
import { strings } from '../../../lib/shared/strings';
import { listenForDismiss } from '../../../lib/page/dismiss';
import { CloseIcon, PinIcon } from '../../../lib/page/icons';
import { KeyCombo } from '../../../lib/page/keyCombo';
import { type PeekAnchor, liftOf, hiddenLines } from './messageHolding';

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
  useEffect(
    () => (onUnpin ? listenForDismiss(window, panel, onUnpin) : undefined),
    [onUnpin],
  );
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
      setLifted(
        liftOf(
          { top: box.top + lifted, bottom: box.bottom + lifted },
          anchor.room,
        ),
      );
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
        title={strings.common.close}
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
            parseFloat(style.lineHeight),
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
