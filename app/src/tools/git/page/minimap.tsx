import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { hideAfter } from '../../../lib/page/scrollbarGeometry';
import {
  type MinimapMark,
  pointerFraction,
  minimapScrollTop,
  grabPointer,
} from './minimapMarks';

function percent(value: number): string {
  return `${value * 100}%`;
}

type Scroller = Pick<
  Element,
  'scrollTop' | 'addEventListener' | 'removeEventListener' | 'dispatchEvent'
>;

function followScroll(
  scroller: RefObject<Scroller | null>,
  changed: () => void,
): () => void {
  const element = scroller.current;
  element?.addEventListener('scroll', changed, { passive: true });
  return () => element?.removeEventListener('scroll', changed);
}

const Marks = memo(function Marks({
  marks,
  scale,
}: {
  marks: readonly MinimapMark[];
  scale: number;
}) {
  return marks.map((mark) => (
    <div
      key={`${mark.kind}:${mark.top}`}
      className={`minimap-mark ${mark.kind}`}
      style={{
        top: percent(mark.top * scale),
        height: percent(mark.height * scale),
      }}
    />
  ));
});

export function Minimap({
  marks,
  scroller,
  viewport,
  total,
  pinned = false,
  onDrag,
  onScroll,
}: {
  marks: readonly MinimapMark[];
  scroller: RefObject<Scroller | null>;
  viewport: number;
  total: number;
  pinned?: boolean;
  onDrag?: (dragging: boolean) => void;
  onScroll: (top: number) => void;
}) {
  const subscribe = useCallback(
    (changed: () => void) => followScroll(scroller, changed),
    [scroller],
  );
  const scrolledTo = () => scroller.current?.scrollTop ?? 0;
  const scrollTop = useSyncExternalStore(subscribe, scrolledTo, scrolledTo);
  const element = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const timer = useRef<number>(undefined);
  const show = useRef(() => {
    setShown(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(false), hideAfter);
  });
  useEffect(() => {
    const area = element.current?.parentElement;
    const poke = show.current;
    area?.addEventListener('pointermove', poke);
    return () => {
      area?.removeEventListener('pointermove', poke);
      window.clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    const strip = element.current;
    const onWheel = (event: WheelEvent) => {
      const target = scroller.current;
      if (!target) {
        return;
      }
      event.preventDefault();
      target.dispatchEvent(new WheelEvent('wheel', event));
    };
    strip?.addEventListener('wheel', onWheel, { passive: false });
    return () => strip?.removeEventListener('wheel', onWheel);
  }, [scroller]);
  const scrolled = useRef(scrollTop);
  useEffect(() => {
    if (scrolled.current !== scrollTop) {
      scrolled.current = scrollTop;
      show.current();
    }
  }, [scrollTop]);

  const scrollTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const fraction = pointerFraction(
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
    onScroll(minimapScrollTop(fraction, total, viewport));
  };
  return (
    <div
      ref={element}
      className={`diff-minimap ${shown || dragging || pinned ? 'shown' : ''} ${dragging ? 'dragging' : ''}`}
      onPointerDown={(event) => {
        if (grabPointer(event)) {
          setDragging(true);
          onDrag?.(true);
          scrollTo(event);
        }
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          scrollTo(event);
        }
      }}
      onPointerUp={() => {
        setDragging(false);
        onDrag?.(false);
      }}
      onPointerCancel={() => {
        setDragging(false);
        onDrag?.(false);
      }}
    >
      <Marks
        marks={marks}
        scale={total > 0 && total < viewport ? total / viewport : 1}
      />
      {total > viewport && (
        <div
          className="minimap-viewport"
          style={{
            top: percent(scrollTop / total),
            height: percent(viewport / total),
          }}
        />
      )}
    </div>
  );
}
