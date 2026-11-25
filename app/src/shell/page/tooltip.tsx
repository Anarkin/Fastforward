import { characterTip } from '../../lib/page/tips';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Card } from './card';
import { useShell } from './store';
import { placedTip, type TipBox } from './tipPlace';
import { watchTips, type ShownTip, type TipWatch } from './tipWatch';

let waits = 0;
let characterWaits = 0;
let watch: TipWatch | undefined;

const subscribe = (listener: () => void) => {
  watch ??= watchTips(document, (anchor) =>
    anchor.hasAttribute(characterTip) ? characterWaits : waits,
  );
  return watch.subscribe(listener);
};

const shownNow = () => watch?.shown();

const shownNowhere = () => undefined;

function cutBox(anchor: Element): TipBox {
  const cut =
    [anchor, ...anchor.querySelectorAll('*')].find(
      (part) => part.scrollWidth > part.clientWidth,
    ) ?? anchor;
  const box = cut.getBoundingClientRect();
  const start = parseFloat(getComputedStyle(cut).paddingLeft) || 0;
  return {
    left: box.left + start,
    top: box.top,
    width: box.width - start,
    height: box.height,
  };
}

function place(card: HTMLElement, { tip, anchor }: ShownTip): void {
  const size = card.getBoundingClientRect();
  const words = card.querySelector('.card-message')?.getBoundingClientRect();
  const placed = placedTip(
    tip.at === 'over' ? cutBox(anchor) : anchor.getBoundingClientRect(),
    size,
    { width: window.innerWidth, height: window.innerHeight },
    tip.at,
    (words?.left ?? size.left) - size.left,
    window.devicePixelRatio,
  );
  card.style.left = `${placed.left}px`;
  card.style.top = `${placed.top}px`;
  card.style.visibility = 'visible';
}

export function Tooltip() {
  const delay = useShell((state) => state.tipDelay);
  const characterDelay = useShell((state) => state.characterTipDelay);
  useEffect(() => {
    waits = delay;
    characterWaits = characterDelay;
  }, [delay, characterDelay]);
  const shown = useSyncExternalStore(subscribe, shownNow, shownNowhere);
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (shown !== undefined && card.current !== null) {
      place(card.current, shown);
    }
  }, [shown]);
  return (
    shown !== undefined && (
      <Card
        ref={card}
        kind="tip"
        role="tooltip"
        said={shown.tip.said}
        rows={shown.tip.rows}
      />
    )
  );
}
