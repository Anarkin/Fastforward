import { useLayoutEffect, useState, type RefObject } from 'react';

const onLine = 0.01;

function onDevicePixels(length: number, ratio: number): number {
  return Math.round(length * ratio) / ratio;
}

export function inLines(height: number, line: number): number {
  return Math.max(0, Math.ceil(height / line - onLine)) * line;
}

export function measureInLines(
  line: number,
  ratio: number,
): (element: Element, entry: ResizeObserverEntry | undefined) => number {
  return (element, entry) =>
    inLines(
      onDevicePixels(
        entry?.borderBoxSize[0]?.blockSize ??
          element.getBoundingClientRect().height,
        ratio,
      ),
      line,
    );
}

export function lineHeightOf(
  element: Element | null,
  fallback: number,
  ratio: number,
): number {
  const height =
    element === null
      ? Number.NaN
      : parseFloat(
          element.ownerDocument.defaultView?.getComputedStyle(element)
            .lineHeight ?? '',
        );
  return height > 0 ? onDevicePixels(height, ratio) : fallback;
}

export function useLineHeight(
  element: RefObject<Element | null>,
  fallback: number,
  ratio: number,
): number {
  const [height, setHeight] = useState(fallback);
  useLayoutEffect(() => {
    setHeight(lineHeightOf(element.current, fallback, ratio));
  }, [element, fallback, ratio]);
  return height;
}
