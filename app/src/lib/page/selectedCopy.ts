import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import { soughtCopy } from '../shared/textMatches';
import { scratchRange } from './scratchRange';
import { realText } from './picturedCopy';

const restMs = 250;

interface RowPoint {
  readonly row: string;
  readonly at: number;
}

interface KeptSelection {
  readonly anchor: RowPoint;
  readonly focus: RowPoint;
  readonly text: string;
}

function textsOf(row: Element): Text[] {
  const texts: Text[] = [];
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('[aria-hidden="true"]') === null
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Text) {
      texts.push(node);
    }
  }
  return texts;
}

function pointOf(
  root: Element,
  rowKey: string,
  node: Node | null,
  offset: number,
): RowPoint | undefined {
  const element = node instanceof Element ? node : node?.parentElement;
  const row = element?.closest(`[${rowKey}]`);
  if (row === null || row === undefined || !root.contains(row)) {
    return undefined;
  }
  const range = scratchRange();
  range.selectNodeContents(row);
  range.setEnd(node ?? row, offset);
  let at = 0;
  for (const text of textsOf(row)) {
    if (range.comparePoint(text, text.length) <= 0) {
      at += text.length;
    } else if (range.comparePoint(text, 0) <= 0) {
      at += range.endContainer === text ? range.endOffset : 0;
    }
  }
  return { row: row.getAttribute(rowKey) ?? '', at };
}

function placeOf(
  root: Element,
  rowKey: string,
  point: RowPoint,
): { readonly node: Node; readonly offset: number } | undefined {
  const row = [...root.querySelectorAll(`[${rowKey}]`)].find(
    (each) => each.getAttribute(rowKey) === point.row,
  );
  if (row === undefined) {
    return undefined;
  }
  let left = point.at;
  for (const text of textsOf(row)) {
    if (left <= text.length) {
      return { node: text, offset: left };
    }
    left -= text.length;
  }
  return undefined;
}

export function useSelectedCopy(
  root: RefObject<Element | null>,
  rowKey: string,
  watching: boolean,
  chosen: (copy: string | undefined) => void,
  marked: string | undefined,
): void {
  const choose = useEffectEvent(chosen);
  const kept = useRef<KeptSelection | undefined>(undefined);
  useEffect(() => {
    if (!watching) {
      kept.current = undefined;
      choose(undefined);
      return undefined;
    }
    let resting: ReturnType<typeof setTimeout> | undefined;
    let shown: string | undefined;
    const read = () => {
      const selection = document.getSelection();
      const within = root.current;
      const inside =
        selection !== null &&
        !selection.isCollapsed &&
        within !== null &&
        within.contains(selection.anchorNode) &&
        within.contains(selection.focusNode);
      const selected = inside
        ? soughtCopy(realText(selection).trim())
        : undefined;
      clearTimeout(resting);
      if (selected === shown) {
        return;
      }
      if (shown !== undefined) {
        shown = undefined;
        kept.current = undefined;
        choose(undefined);
      }
      if (selected !== undefined && inside) {
        resting = setTimeout(() => {
          const anchor = pointOf(
            within,
            rowKey,
            selection.anchorNode,
            selection.anchorOffset,
          );
          const focus = pointOf(
            within,
            rowKey,
            selection.focusNode,
            selection.focusOffset,
          );
          kept.current =
            anchor === undefined || focus === undefined
              ? undefined
              : { anchor, focus, text: selection.toString() };
          shown = selected;
          choose(selected);
        }, restMs);
      }
    };
    document.addEventListener('selectionchange', read);
    read();
    return () => {
      document.removeEventListener('selectionchange', read);
      clearTimeout(resting);
    };
  }, [root, rowKey, watching]);
  useLayoutEffect(() => {
    const within = root.current;
    const keep = kept.current;
    const selection = document.getSelection();
    if (
      marked === undefined ||
      within === null ||
      keep === undefined ||
      selection === null ||
      (!selection.isCollapsed && selection.toString() === keep.text)
    ) {
      return;
    }
    const anchor = placeOf(within, rowKey, keep.anchor);
    const focus = placeOf(within, rowKey, keep.focus);
    if (anchor !== undefined && focus !== undefined) {
      selection.setBaseAndExtent(
        anchor.node,
        anchor.offset,
        focus.node,
        focus.offset,
      );
    }
  }, [root, rowKey, marked]);
}
