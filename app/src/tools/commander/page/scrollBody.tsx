import { useCallback, useEffect, useRef, useState } from 'react';
import { keyPressed } from '../../../ui/shortcuts';
import { viewerKeymap } from '../shared/keymap';
import { followDrag } from '../../../ui/followDrag';
import {
  hideAfter,
  overlayScrollbarClass,
} from '../../../ui/overlayScrollbars';

export interface Thumb {
  readonly start: number;
  readonly length: number;
}

const minThumb = 24;

const probeText = '0'.repeat(100);

export function thumbBox(
  thumb: Thumb,
  track: number,
): { readonly top: number; readonly height: number } {
  const height = Math.min(track, Math.max(minThumb, thumb.length * track));
  return { top: thumb.start * (track - height), height };
}

function copiedRows(
  selection: Selection | null,
  shown: Element | null,
): string | undefined {
  if (selection === null || selection.rangeCount === 0 || shown === null) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  const rows = [...shown.children].filter((row) => range.intersectsNode(row));
  if (!rows.slice(0, -1).some((row) => row.hasAttribute('data-continues'))) {
    return undefined;
  }
  return rows
    .map((row, index) => {
      const part = document.createRange();
      part.selectNodeContents(row);
      if (row.contains(range.startContainer)) {
        part.setStart(range.startContainer, range.startOffset);
      }
      if (row.contains(range.endContainer)) {
        part.setEnd(range.endContainer, range.endOffset);
      }
      const ends =
        index === rows.length - 1 || row.hasAttribute('data-continues')
          ? ''
          : '\n';
      return `${part.toString()}${ends}`;
    })
    .join('');
}

export function ScrollBody({
  thumb,
  onScreen,
  onColumns,
  move,
  jump,
  error,
  children,
}: {
  thumb: Thumb | undefined;
  onScreen: (screen: number) => void;
  onColumns?: (columns: number) => void;
  move: (by: number) => void;
  jump: (share: number) => void;
  error: string | undefined;
  children: React.ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [track, setTrack] = useState(0);
  const [screen, setScreen] = useState(1);
  const wheel = useRef(0);
  const [barShown, setBarShown] = useState(false);
  const [heldAt, setHeldAt] = useState<number>();
  const hiding = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showBar = useCallback(() => {
    clearTimeout(hiding.current);
    setBarShown(true);
    hiding.current = setTimeout(() => setBarShown(false), hideAfter);
  }, []);
  useEffect(() => () => clearTimeout(hiding.current), []);
  useEffect(() => body.current?.focus(), []);

  useEffect(() => {
    const element = body.current;
    const row = probe.current;
    if (!element || !row) {
      return undefined;
    }
    const measure = () => {
      const height = row.getBoundingClientRect().height || 1;
      const rows = Math.max(1, Math.floor(element.clientHeight / height));
      setScreen(rows);
      onScreen(rows);
      setTrack(element.clientHeight);
      const style = getComputedStyle(row);
      const padding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const advance =
        (row.getBoundingClientRect().width - padding) / probeText.length || 1;
      onColumns?.(
        Math.max(1, Math.floor((element.clientWidth - padding) / advance)),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onScreen, onColumns]);

  const moved = (by: number) => {
    showBar();
    move(by);
  };
  const box = thumb && thumbBox(thumb, track);
  const dragging = heldAt !== undefined;

  return (
    <div
      className="column-body viewer-body"
      ref={body}
      tabIndex={0}
      data-column-focus=""
      onPointerMove={showBar}
      onCopy={(event) => {
        const copied = copiedRows(
          getSelection(),
          event.currentTarget.querySelector('.viewer-rows'),
        );
        if (copied !== undefined) {
          event.preventDefault();
          event.clipboardData.setData('text/plain', copied);
        }
      }}
      onWheel={(event) => {
        wheel.current += event.deltaY;
        const height = probe.current?.getBoundingClientRect().height ?? 1;
        const rows = Math.trunc(wheel.current / height);
        if (rows !== 0) {
          wheel.current -= rows * height;
          moved(rows);
        }
      }}
      onKeyDown={(event) => {
        const step = keyPressed(viewerKeymap.scroll, event);
        if (step === undefined) {
          return;
        }
        event.preventDefault();
        switch (step) {
          case 'up':
            moved(-1);
            return;
          case 'down':
            moved(1);
            return;
          case 'pageUp':
            moved(-Math.max(1, screen - 1));
            return;
          case 'pageDown':
            moved(Math.max(1, screen - 1));
            return;
          case 'first':
            jump(0);
            return;
          case 'last':
            jump(1);
            return;
          default:
            step satisfies never;
        }
      }}
    >
      <div className="viewer-row commander-viewer-probe" ref={probe}>
        {probeText}
      </div>
      {error === undefined ? (
        <div className="viewer-rows">{children}</div>
      ) : (
        <div className="viewer-error">{error}</div>
      )}
      {box !== undefined && (
        <div
          className="viewer-scrollbar"
          onPointerDown={(event) => {
            event.preventDefault();
            const bar = event.currentTarget.getBoundingClientRect();
            const at = (clientY: number) => {
              const share =
                Math.min(Math.max(clientY - bar.top, 0), bar.height) /
                Math.max(1, bar.height);
              setHeldAt(share);
              jump(share);
            };
            at(event.clientY);
            followDrag(
              window,
              (pointer: PointerEvent) => at(pointer.clientY),
              () => {
                setHeldAt(undefined);
                showBar();
              },
            );
          }}
        >
          <div
            className={`${overlayScrollbarClass} viewer-thumb${barShown || dragging ? ' shown' : ''}${dragging ? ' dragging' : ''}`}
            style={{
              top:
                heldAt === undefined ? box.top : heldAt * (track - box.height),
              height: box.height,
            }}
          />
        </div>
      )}
    </div>
  );
}
