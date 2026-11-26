import { useLayoutEffect, useRef } from 'react';

export function RowRuler({ onLine }: { onLine: (height: number) => void }) {
  const ruler = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ruler.current;
    if (element === null) {
      return undefined;
    }
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) {
        onLine(height);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onLine]);
  return <div ref={ruler} className="row files-ruler" aria-hidden="true" />;
}
