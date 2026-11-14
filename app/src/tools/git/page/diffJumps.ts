import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { DiffFile } from './diff';
import type { DiffRow } from './diffRows';
import {
  changeMargin,
  changeStarts,
  firstChangeTop,
  foundEdges,
  foundMiddle,
  foundScroll,
} from './diffScrolling';
import { jumpStep, type FindMatch } from './find';
import { shownSideways } from './overflow';
import { rowLines } from './rowMeasures';
import { readSideways } from './textLayout';

export function largeFilesToLoad(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  diff: number,
  requested: Map<string, number>,
): string[] {
  const load: string[] = [];
  for (const file of files) {
    if (!file.placeholder || toggled.get(file.path) !== true) {
      requested.delete(file.path);
    } else if (requested.get(file.path) !== diff) {
      requested.set(file.path, diff);
      load.push(file.path);
    }
  }
  return load;
}

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
  files,
  toggled,
  diff,
  onLoad,
}: {
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
  readonly files: readonly DiffFile[];
  readonly toggled: ReadonlyMap<string, boolean>;
  readonly diff: number;
  readonly onLoad: (path: string) => void;
}): {
  readonly revealing: string | undefined;
  readonly setRevealing: (revealing: string | undefined) => void;
} {
  const jumped = useRef(0);
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

  const changeJumped = useRef<number>(undefined);
  useEffect(() => {
    if (
      firstChange === undefined ||
      changeJumped.current === firstChange ||
      loading
    ) {
      return;
    }
    changeJumped.current = firstChange;
    if (found !== undefined) {
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

  const requested = useRef(new Map<string, number>());
  useEffect(() => {
    for (const path of largeFilesToLoad(
      files,
      toggled,
      diff,
      requested.current,
    )) {
      onLoad(path);
    }
  }, [files, toggled, diff, onLoad]);
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
  scrollsSides,
  sideways,
  reveal,
  virtualizer,
  lineHeight,
}: {
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
  readonly scrollsSides: boolean;
  readonly sideways: number;
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
      const row = element.querySelector(`.virtual-row[data-index="${index}"]`);
      const edges = row ? foundEdges(row) : undefined;
      const start = virtualizer
        .getVirtualItems()
        .find((item) => item.index === index)?.start;
      if (row && edges && start !== undefined) {
        const box = element.getBoundingClientRect();
        const middle = foundMiddle(
          edges,
          {
            top: box.top + rowLines.file * lineHeight,
            bottom: box.top + element.clientHeight,
          },
          { top: row.getBoundingClientRect().top, start },
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
    const shown = shownSideways(
      readSideways(element, scrollsSides),
      scrollsSides,
      sideways,
    );
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
    scrollsSides,
    sideways,
    reveal,
    virtualizer,
    lineHeight,
  ]);
}
