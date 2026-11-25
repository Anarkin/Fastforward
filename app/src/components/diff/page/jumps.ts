import { widthsFor } from '../../../lib/page/textWidths';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { DiffRow } from './rows';
import { changeMargin, changeStarts, firstChangeTop } from './scrolling';
import { foundMiddle, foundRows, foundScroll } from './found';
import { wrappedRows } from '../../cells/page/lines';
import { paneLine } from './paneLines';
import { jumpStep, type FindMatch } from './find';
import { rowLines, type WrapColumns } from './rowMeasures';
import { readSideBox } from './sideways';

export function useFoundJumps({
  jump,
  found,
  foundKey,
  loading,
  rows,
  keys,
  virtualizer,
  setToggled,
  firstChange,
  lineHeight,
  placed,
}: {
  readonly placed: boolean;
  readonly jump: number;
  readonly found: FindMatch | undefined;
  readonly foundKey: string | undefined;
  readonly loading: boolean;
  readonly rows: readonly DiffRow[];
  readonly keys: readonly (readonly string[])[];
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly setToggled: (
    toggle: (all: ReadonlyMap<string, boolean>) => ReadonlyMap<string, boolean>,
  ) => void;
  readonly firstChange: number | undefined;
  readonly lineHeight: number;
}): {
  readonly revealing: string | undefined;
  readonly setRevealing: (revealing: string | undefined) => void;
} {
  const jumped = useRef(placed ? jump : 0);
  const [revealing, setRevealing] = useState<string>();
  useEffect(() => {
    if (jumped.current === jump) {
      return;
    }
    const header =
      found &&
      rows.find((row) => row.kind === 'file' && row.file === found.file);
    const closed = header?.kind === 'file' && !header.open;
    switch (jumpStep(found !== undefined, loading, !closed)) {
      case 'wait':
        return;
      case 'done':
        jumped.current = jump;
        return;
      case 'open':
        if (header?.kind === 'file') {
          setToggled((all) => new Map(all).set(header.path, true));
        }
        return;
      case 'scroll': {
        const index = keys.findIndex((row) => row.includes(foundKey ?? ''));
        if (index !== -1) {
          virtualizer.scrollToIndex(index, { align: 'center' });
          jumped.current = jump;
          setRevealing(foundKey);
        }
      }
    }
  }, [jump, found, foundKey, loading, rows, keys, virtualizer, setToggled]);

  const changeJumped = useRef(placed ? firstChange : undefined);
  const cameBackPlaced = useRef(placed);
  useEffect(() => {
    if (
      firstChange === undefined ||
      changeJumped.current === firstChange ||
      loading
    ) {
      return;
    }
    const keptPlace =
      cameBackPlaced.current && changeJumped.current === undefined;
    changeJumped.current = firstChange;
    if (found !== undefined || keptPlace) {
      return;
    }
    const top = firstChangeTop(
      changeStarts(rows).map(
        (index) => virtualizer.measurementsCache[index]?.start ?? 0,
      ),
      changeMargin(lineHeight),
    );
    if (top !== undefined) {
      virtualizer.scrollToOffset(top);
    }
  }, [firstChange, loading, found, rows, virtualizer, lineHeight]);
  return { revealing, setRevealing };
}

export function useRevealFound({
  list,
  revealing,
  setRevealing,
  found,
  foundKey,
  keys,
  items,
  rows,
  wordWrap,
  widths,
  room,
  scrolledNow,
  reveal,
  virtualizer,
  lineHeight,
  wrapping,
}: {
  readonly wrapping: WrapColumns | undefined;
  readonly list: RefObject<HTMLDivElement | null>;
  readonly revealing: string | undefined;
  readonly setRevealing: (revealing: string | undefined) => void;
  readonly found: FindMatch | undefined;
  readonly foundKey: string | undefined;
  readonly keys: readonly (readonly string[])[];
  readonly items: readonly VirtualItem[];
  readonly rows: readonly DiffRow[];
  readonly wordWrap: boolean;
  readonly widths: TextWidths;
  readonly room: number;
  readonly scrolledNow: () => number;
  readonly reveal: (scrolled: number) => void;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly lineHeight: number;
}): void {
  useLayoutEffect(() => {
    const element = list.current;
    if (!revealing || !element) {
      return;
    }
    const index =
      revealing === foundKey
        ? keys.findIndex((row) => row.includes(revealing))
        : -1;
    if (index !== -1 && !items.some((item) => item.index === index)) {
      return;
    }
    setRevealing(undefined);
    if (!found || index === -1) {
      return;
    }
    if (wordWrap) {
      const start = virtualizer
        .getVirtualItems()
        .find((item) => item.index === index)?.start;
      if (start === undefined) {
        return;
      }
      const box = element.getBoundingClientRect();
      const top = box.top + start - element.scrollTop;
      const edges = [0, 1].flatMap((pane) => {
        const lined = paneLine(rows, keys, pane, index);
        if (lined === undefined || lined.key !== foundKey) {
          return [];
        }
        const within = foundRows(
          wrappedRows(
            lined.line,
            pane === 0 ? wrapping?.left : wrapping?.right,
            widthsFor(lined.line.text, widths),
          ),
          found,
          lineHeight,
        );
        return [{ top: top + within.top, bottom: top + within.bottom }];
      })[0];
      if (edges) {
        const middle = foundMiddle(
          edges,
          {
            top: box.top + rowLines.file * lineHeight,
            bottom: box.top + element.clientHeight,
          },
          { top, start },
        );
        if (middle !== undefined) {
          virtualizer.scrollToOffset(middle, { align: 'center' });
        }
      }
      return;
    }
    if (widths.char === 0) {
      return;
    }
    const shown = { ...readSideBox(element), scrolled: scrolledNow(), room };
    const scrolled = foundScroll(rows[index], found, shown, widths);
    if (scrolled !== undefined && scrolled !== shown.scrolled) {
      reveal(scrolled);
    }
  }, [
    list,
    revealing,
    setRevealing,
    found,
    foundKey,
    keys,
    items,
    rows,
    wordWrap,
    widths,
    room,
    scrolledNow,
    reveal,
    virtualizer,
    lineHeight,
    wrapping,
  ]);
}
