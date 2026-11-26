import { useEffect, useEffectEvent, useState } from 'react';
import { labelled, tip } from '../../../lib/page/tips';
import { ToolIcon } from '../../../lib/page/icons';
import { strings } from '../../../lib/shared/strings';
import type { Located } from './linePlaces';
import type { LineSight, PointerPlaces } from './lineSight';
import { paneItemOf, usePaneItem, type PaneItemProps } from './paneItem';
import { useCommanderActions, useCommanderNow } from './store';

const markClass = 'commander-pointed-mark';

const unplaced: PointerPlaces = {
  gitLeft: 0,
  gitSize: 0,
  size: { left: 0, top: 0, width: 0, height: 0 },
};

function PointedLine({
  item,
  ink,
  box,
  places,
  marksRepositories,
}: {
  item: PaneItemProps;
  ink: string | undefined;
  box: Located;
  places: PointerPlaces;
  marksRepositories: boolean;
}) {
  const { row, look, side } = item;
  const actions = useCommanderActions();
  const { itemEvents } = usePaneItem(item);
  const repository = marksRepositories && !look.gitMissing && row.repository;
  const unread = row.entry?.unreadFolders;
  return (
    <div
      className="commander-pointed"
      data-key={row.key}
      draggable={itemEvents.draggable}
      onDragStart={itemEvents.onDragStart}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        color: ink,
      }}
    >
      {repository && (
        <button
          className={`commander-mark ${markClass}`}
          style={{
            left: places.gitLeft,
            top: 0,
            width: places.gitSize,
            height: box.height,
          }}
          {...labelled(strings.commander.openRepository)}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            actions.openRepository(side, row.key);
          }}
        >
          <ToolIcon tool="git" />
        </button>
      )}
      {unread !== undefined && (
        <span
          className="commander-pointed-size"
          style={places.size}
          {...tip(strings.commander.unreadUnder(unread))}
        />
      )}
    </div>
  );
}

const onMark = (target: EventTarget | null) =>
  typeof target === 'object' &&
  target !== null &&
  'closest' in target &&
  typeof target.closest === 'function' &&
  target.closest(`.${markClass}`) !== null;

const sameBox = (one: Located | undefined, other: Located) =>
  one !== undefined &&
  one.index === other.index &&
  one.overCheck === other.overCheck &&
  one.left === other.left &&
  one.top === other.top &&
  one.width === other.width &&
  one.height === other.height;

export function PanePointer({
  list,
  locate,
  sight,
  itemOf,
  marksRepositories,
}: {
  list: React.RefObject<HTMLElement | null>;
  locate: (
    element: HTMLElement,
    at: { readonly x: number; readonly y: number },
  ) => Located | undefined;
  sight: LineSight;
  itemOf: (index: number) => PaneItemProps | undefined;
  marksRepositories: boolean;
}) {
  const [shown, setShown] = useState<Located>();
  const actions = useCommanderActions();
  const now = useCommanderNow();
  const located = (at: { x: number; y: number }) => {
    const element = list.current;
    return element === null ? undefined : locate(element, at);
  };
  const moved = useEffectEvent((at: { x: number; y: number } | undefined) => {
    const pointed = at === undefined ? undefined : located(at);
    sight.point(pointed);
    setShown((was) =>
      pointed === undefined ? undefined : sameBox(was, pointed) ? was : pointed,
    );
  });
  const pressed = useEffectEvent(
    (kind: 'pointerdown' | 'click' | 'contextmenu', event: MouseEvent) => {
      const pointed = located({ x: event.clientX, y: event.clientY });
      const item = pointed === undefined ? undefined : itemOf(pointed.index);
      if (pointed === undefined || item === undefined) {
        return;
      }
      const { itemEvents, toggleMark } = paneItemOf(item, actions, now);
      const boxed = pointed.overCheck && item.row.entry !== undefined;
      if (kind === 'pointerdown') {
        if (!boxed) {
          itemEvents.onPointerDown(event);
        }
      } else if (kind === 'click') {
        if (onMark(event.target)) {
          return;
        }
        if (boxed) {
          toggleMark();
        } else {
          itemEvents.onClick(event);
        }
      } else {
        itemEvents.onContextMenu(event);
      }
    },
  );

  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    let last: { x: number; y: number } | undefined;
    const onMove = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY };
      moved(last);
    };
    const onLeave = () => {
      last = undefined;
      moved(undefined);
    };
    const onScroll = () => moved(last);
    const onDown = (event: PointerEvent) => pressed('pointerdown', event);
    const onClick = (event: MouseEvent) => pressed('click', event);
    const onMenu = (event: MouseEvent) => pressed('contextmenu', event);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    element.addEventListener('scroll', onScroll);
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('click', onClick);
    element.addEventListener('contextmenu', onMenu);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('click', onClick);
      element.removeEventListener('contextmenu', onMenu);
    };
  }, [list]);

  const item = shown === undefined ? undefined : itemOf(shown.index);
  return (
    shown !== undefined &&
    item !== undefined && (
      <PointedLine
        key={item.row.key}
        item={item}
        ink={sight.inkOf(shown.index)}
        box={shown}
        places={sight.places ?? unplaced}
        marksRepositories={marksRepositories}
      />
    )
  );
}
