import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import {
  scrollProxy,
  type ScrollProxy as Proxy,
  type Shown,
} from './scrollProxies';

export function ScrollProxy({
  axis,
  shown,
  onDrag,
  onLetGo,
  onStep,
  view,
  children,
}: {
  axis: 'vertical' | 'horizontal';
  shown: Shown | undefined;
  onDrag: (share: number) => void;
  onLetGo: () => void;
  onStep: (steps: number) => void;
  view?: React.RefObject<Element | null>;
  children?: React.ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const proxy = useRef<Proxy>(undefined);
  const dragged = useEffectEvent((share: number) => onDrag(share));
  const letGo = useEffectEvent(() => onLetGo());
  const stepped = useEffectEvent((steps: number) => onStep(steps));
  useLayoutEffect(() => {
    if (element.current === null) {
      return undefined;
    }
    const made = scrollProxy(
      element.current,
      axis,
      { onDrag: dragged, onLetGo: letGo, onStep: stepped },
      view?.current ?? undefined,
    );
    proxy.current = made;
    return () => {
      made.stop();
      proxy.current = undefined;
    };
  }, [axis, view]);
  const at = shown?.at;
  const length = shown?.length;
  useLayoutEffect(() => {
    proxy.current?.show(
      at === undefined || length === undefined ? undefined : { at, length },
    );
  }, [at, length]);
  return (
    <div className={`scroll-proxy-frame ${axis}`}>
      <div className={`scroll-proxy ${axis}`} ref={element}>
        <div className="scroll-proxy-size" />
      </div>
      {children}
    </div>
  );
}
