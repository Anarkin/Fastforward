import { useSyncExternalStore } from 'react';
import { ScrollProxy } from '../../../lib/page/scrollProxy';
import type { HeldScroller } from '../../../lib/page/scrollbarLinks';
import type { SidewaysShown } from './sidewaysShown';

export function SidewaysBars({
  shown,
  held,
  sides,
  list,
}: {
  shown: SidewaysShown;
  held: HeldScroller;
  sides: number;
  list: React.RefObject<Element | null>;
}) {
  const view = useSyncExternalStore(shown.subscribe, shown.read, shown.read);
  const room = view?.room ?? 0;
  const part =
    view !== undefined && room > 0
      ? { at: view.scrolled / room, length: view.width / (view.width + room) }
      : undefined;
  return (
    <>
      {Array.from({ length: sides }, (_, side) => (
        <ScrollProxy
          key={side}
          axis="horizontal"
          shown={part}
          onDrag={(share) => held.dragTo(share * room)}
          onLetGo={held.dragEnd}
          onStep={(steps) => held.stepBy?.(steps)}
          view={list}
        />
      ))}
    </>
  );
}
