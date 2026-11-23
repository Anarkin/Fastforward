import { fontDotLook, type DotLook } from '../../../lib/page/dotLook';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type RefObject,
  useRef,
} from 'react';
import { textWidths, type TextWidths } from '../../../lib/page/textWidths';
import {
  plainCells,
  useCellTable,
  type CellTable,
} from '../../../lib/page/cellTable';
import type { DiffMeasures, DiffMeasuring } from './measures';
import { uniformHeight } from './rowMeasures';
import { codeSnapOf, codeStarts, sameSnap, type CodeSnap } from './codeSnap';

export function useCodeSnap(
  listRef: RefObject<HTMLDivElement | null>,
  snapDiffCode: DiffMeasuring['snapCode'],
  laidOut: readonly unknown[],
): void {
  const snapCode = useCallback(() => {
    const element = listRef.current;
    if (!element) {
      return false;
    }
    const starts = codeStarts(element);
    snapDiffCode((last) => {
      const next = codeSnapOf(starts, devicePixelRatio, last);
      return sameSnap(last, next) ? last : next;
    });
    return (
      starts.inline !== undefined ||
      (starts.left !== undefined && starts.right !== undefined)
    );
  }, [listRef, snapDiffCode]);
  const snapped = useRef<readonly unknown[]>(undefined);
  useLayoutEffect(() => {
    const kept = snapped.current;
    if (
      kept?.length === laidOut.length &&
      kept.every((part, at) => Object.is(part, laidOut[at]))
    ) {
      return;
    }
    snapped.current = snapCode() ? laidOut : undefined;
  });
  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(snapCode);
    observer.observe(element);
    return () => observer.disconnect();
  }, [listRef, snapCode]);
}

export function useDiffText(
  measures: DiffMeasures,
  measuring: DiffMeasuring,
): {
  readonly table: CellTable | undefined;
  readonly charWidth: number;
  readonly widths: TextWidths;
  readonly dotLook: DotLook | undefined;
  readonly scale: number;
  readonly lineHeight: number;
  readonly measureText: (
    width: number,
    measuredFont: string,
    measuredScale: number,
    measuredLineHeight: number,
    measuredSpacing: number,
  ) => void;
  readonly snap: CodeSnap;
} {
  const measuredText = measures.text;
  const { measureText: measureDiffText } = measuring;
  const charWidth = measuredText?.charWidth ?? 0;
  const font = measuredText?.font ?? '';
  const spacing = measuredText?.spacing ?? 0;
  const table = useCellTable();
  const widths = useMemo(
    () => textWidths(charWidth, font, spacing, table ?? plainCells),
    [charWidth, font, spacing, table],
  );
  const dotLook = useMemo(
    () => fontDotLook(font, charWidth, 1 / (measuredText?.scale ?? 1)),
    [font, charWidth, measuredText?.scale],
  );
  const scale = measuredText?.scale ?? 1;
  const lineHeight = measuredText?.lineHeight ?? uniformHeight;
  const measureText = useCallback(
    (
      width: number,
      measuredFont: string,
      measuredScale: number,
      measuredLineHeight: number,
      measuredSpacing: number,
    ) =>
      measureDiffText({
        charWidth: width,
        font: measuredFont,
        spacing: measuredSpacing,
        scale: measuredScale,
        lineHeight: measuredLineHeight,
      }),
    [measureDiffText],
  );
  const { snap } = measures;
  return {
    table,
    charWidth,
    widths,
    dotLook,
    scale,
    lineHeight,
    measureText,
    snap,
  };
}
