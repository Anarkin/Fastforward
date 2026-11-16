import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { clicked } from '../../../lib/shared/keymap';
import './style.css';
import { commanderKeymap } from './keymap';
import {
  type CommanderDrop,
  type CommanderToHost,
  type CommanderToWebview,
} from '../shared/protocol';
import { sides } from '../shared/sides';
import { Pane } from './pane';
import { followDrag } from '../../../lib/page/followDrag';
import { useBinding } from '../../../lib/page/shortcuts';
import { CommanderPopups } from './commanderPopups';
import { CommanderStore, createCommanderStore } from './store';
import { sideToFocus } from './sideFocus';
import { focusBack } from '../../../lib/page/keptFocus';
import { useRestore } from '../../../lib/page/restore';
import { shareOf } from './sideShare';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';

export function CommanderTool({
  active,
  post,
  listen,
  dropFiles,
  views = noViews,
}: {
  active: boolean;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: CommanderToWebview) => void) => () => void;
  dropFiles?: (files: readonly File[], message: CommanderDrop) => void;
  views?: ToolViews;
}) {
  const [store] = useState(() =>
    createCommanderStore(post, {}, undefined, dropFiles, views),
  );
  const tab = useStore(store, (state) => state.view.tab);
  const activeSide = useStore(store, (state) => state.view.active);
  const share = useStore(store, (state) => state.view.share);
  const canGroupByColor = useStore(
    store,
    (state) => state.view.fileColors.colors.length > 0,
  );
  const hasDrives = useStore(store, (state) => state.drives.length > 0);
  const {
    activate,
    chooseLayout,
    groupByColor,
    step,
    reread,
    toggleHidden,
    flat,
    askGoTo,
    duplicates,
    dispatch,
  } = store.getState();
  const setShare = (next: number) => dispatch({ type: 'share', share: next });
  const columns = useRef<HTMLDivElement>(null);
  const triggers = {
    left: useRef<HTMLButtonElement>(null),
    right: useRef<HTMLButtonElement>(null),
  };
  const bookmarkTriggers = {
    left: useRef<HTMLButtonElement>(null),
    right: useRef<HTMLButtonElement>(null),
  };

  useEffect(() => listen(store.getState().receive), [listen, store]);
  useEffect(() => views.onRelease(store.getState().releaseTab), [views, store]);
  useEffect(() => {
    const flush = () => store.getState().keepTabs();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [store]);

  const shown = active && tab !== undefined;
  const panesShown = shown;

  const listed = useStore(store, (state) =>
    sides.every((side) => state.view.panes[side] !== undefined),
  );
  const focusedTab = useRef<string>(undefined);
  const restored = useRef(false);
  const keptFocus = useStore(store, (state) =>
    tab === undefined ? undefined : state.view.kept.get(tab)?.focus,
  );
  useRestore(
    panesShown ? keptFocus : undefined,
    () => columns.current !== null,
    (focus) => {
      const root = columns.current;
      if (root !== null && focusBack(root, focus)) {
        restored.current = true;
        return true;
      }
      if (!listed) {
        return false;
      }
      sideToFocus(
        root?.children[sides.indexOf(activeSide)],
        document.activeElement,
      )?.focus();
      return true;
    },
    { key: panesShown ? tab : undefined },
  );
  useEffect(() => {
    if (!panesShown) {
      focusedTab.current = undefined;
      return;
    }
    const column = columns.current?.children[sides.indexOf(activeSide)];
    const fresh = focusedTab.current !== tab;
    focusedTab.current = tab;
    if (restored.current) {
      return;
    }
    sideToFocus(column, fresh ? null : document.activeElement)?.focus();
  }, [panesShown, activeSide, tab]);
  useEffect(() => {
    restored.current = false;
  });

  useBinding(
    commanderKeymap.history,
    (direction) => step(activeSide, direction),
    panesShown,
  );
  useBinding(commanderKeymap.reread, reread, panesShown);
  useBinding(
    commanderKeymap.bookmarks,
    () => bookmarkTriggers[activeSide].current?.click(),
    panesShown,
  );
  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    const side = activeSide;
    const onMouseUp = (event: MouseEvent) => {
      const direction = clicked(commanderKeymap.history, event);
      if (direction !== undefined) {
        event.preventDefault();
        step(side, direction);
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [shown, activeSide, step]);

  useBinding(commanderKeymap.goTo, () => askGoTo(activeSide), panesShown);
  useBinding(commanderKeymap.showHidden, toggleHidden, panesShown);
  useBinding(commanderKeymap.flatView, () => flat(activeSide), panesShown);
  useBinding(
    commanderKeymap.duplicates,
    () => duplicates(activeSide),
    panesShown,
  );
  useBinding(
    commanderKeymap.groupByColor,
    () => groupByColor(activeSide),
    panesShown && canGroupByColor,
  );
  useBinding(
    commanderKeymap.layout,
    (layout) => chooseLayout(activeSide, layout),
    panesShown,
  );
  useBinding(
    commanderKeymap.drive,
    (side) => {
      activate(side);
      sideToFocus(
        columns.current?.children[sides.indexOf(side)],
        document.activeElement,
      )?.focus();
      triggers[side].current?.click();
    },
    panesShown && hasDrives,
  );

  if (!active) {
    return null;
  }
  const resizer = <Resizer columns={columns} onShare={setShare} />;

  return (
    <CommanderStore value={store}>
      <div className="repository commander">
        <div
          className="columns commander-columns"
          ref={columns}
          data-active-side={activeSide}
          style={{
            gridTemplateColumns: `minmax(0, ${share}fr) minmax(0, ${1 - share}fr)`,
          }}
        >
          {sides.map((side) => (
            <Pane
              key={side}
              side={side}
              driveTrigger={triggers[side]}
              bookmarkTrigger={bookmarkTriggers[side]}
              resizer={side === 'left' && resizer}
            />
          ))}
        </div>
        <CommanderPopups />
      </div>
    </CommanderStore>
  );
}

function Resizer({
  columns,
  onShare,
}: {
  columns: React.RefObject<HTMLDivElement | null>;
  onShare: (share: number) => void;
}) {
  return (
    <div
      className="resizer"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const box = columns.current?.getBoundingClientRect();
        if (box === undefined) {
          return;
        }
        followDrag(
          window,
          (move: PointerEvent) =>
            onShare(shareOf(move.clientX - box.left, box.width)),
          () => document.body.classList.remove('resizing'),
        );
        document.body.classList.add('resizing');
      }}
      onDoubleClick={() => onShare(0.5)}
    />
  );
}
