import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { clicked } from '../../../lib/shared/keymap';
import './style.css';
import { commanderKeymap } from './keymap';
import { viewerKeymap } from './viewerKeymap';
import {
  type CommanderDrop,
  type CommanderToHost,
  type CommanderToWebview,
} from '../shared/protocol';
import { sides } from '../shared/sides';
import { Pane } from './pane';
import { Editor } from './editor';
import { Viewer } from './viewer';
import { followDrag } from '../../../lib/page/followDrag';
import { useBinding } from '../../../lib/page/shortcuts';
import { useShellActions } from '../../../shell/page/store';
import { CommanderPopups } from './commanderPopups';
import { CommanderStore, createCommanderStore } from './store';
import { sideToFocus } from './sideFocus';
import { shareOf } from './sideShare';

export function CommanderTool({
  active,
  post,
  listen,
  dropFiles,
}: {
  active: boolean;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: CommanderToWebview) => void) => () => void;
  dropFiles?: (files: readonly File[], message: CommanderDrop) => void;
}) {
  const [store] = useState(() =>
    createCommanderStore(post, {}, undefined, dropFiles),
  );
  const tab = useStore(store, (state) => state.view.tab);
  const viewsFile = useStore(
    store,
    (state) => state.view.viewing !== undefined,
  );
  const editsFile = useStore(
    store,
    (state) => state.view.editing !== undefined,
  );
  const activeSide = useStore(store, (state) => state.view.active);
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
  } = store.getState();
  const { closeTab: onClose } = useShellActions();
  const [share, setShare] = useState(0.5);
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

  const shown = active && tab !== undefined;
  const viewing = shown && viewsFile;
  const panesShown = shown && !viewsFile && !editsFile;

  useEffect(() => {
    if (!panesShown) {
      return;
    }
    sideToFocus(
      columns.current?.children[sides.indexOf(activeSide)],
      document.activeElement,
    )?.focus();
  }, [panesShown, activeSide]);

  useBinding(
    commanderKeymap.history,
    (direction) => step(activeSide, direction),
    panesShown,
  );
  useBinding(
    viewerKeymap.closeViewer,
    () => {
      if (tab !== undefined) {
        onClose(tab);
      }
    },
    viewing,
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

  if (editsFile) {
    return (
      <CommanderStore value={store}>
        <div className="repository commander">
          <div className="columns viewer-columns">
            <Editor key={tab} />
          </div>
        </div>
      </CommanderStore>
    );
  }

  if (viewsFile) {
    return (
      <CommanderStore value={store}>
        <div className="repository commander">
          <div className="columns viewer-columns">
            <Viewer key={tab} />
          </div>
        </div>
      </CommanderStore>
    );
  }

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
