import { useLayoutEffect, useState, type RefObject } from 'react';

function lineHeightOf(element: Element | null, fallback: number): number {
  const height =
    element === null
      ? Number.NaN
      : parseFloat(
          element.ownerDocument.defaultView?.getComputedStyle(element)
            .lineHeight ?? '',
        );
  return height > 0 ? height : fallback;
}

export function useLineHeight(
  element: RefObject<Element | null>,
  fallback: number,
): number {
  const [height, setHeight] = useState(fallback);
  useLayoutEffect(() => {
    setHeight(lineHeightOf(element.current, fallback));
  }, [element, fallback]);
  return height;
}
