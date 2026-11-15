import { useLayoutEffect, useState } from 'react';

function popupBottom(popup: HTMLElement): number {
  return (
    popup.closest('.column')?.getBoundingClientRect().bottom ??
    window.innerHeight
  );
}

export function usePopupHeight(
  popup: React.RefObject<HTMLElement | null>,
): number | undefined {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const fit = () => {
      const element = popup.current;
      if (element) {
        const top = element.getBoundingClientRect().top;
        setHeight(Math.max(200, popupBottom(element) - top));
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [popup]);
  return height;
}
