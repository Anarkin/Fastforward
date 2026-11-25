import type { ToolId } from '../shared/tools';
import {
  namedFile,
  namedFolder,
  type Sentence,
} from '../../lib/shared/sentences';
import { labelled, tip } from '../../lib/page/tips';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type TabInfo } from '../shared/protocol';
import { AddIcon, CloseIcon, ShieldIcon, ToolIcon } from '../../lib/page/icons';
import { titleBarHeight } from '../shared/titleBar';
import { shellKeymap } from '../shared/keymap';
import { clicked } from '../../lib/shared/keymap';
import { strings } from '../../lib/shared/strings';
import { useBinding } from '../../lib/page/shortcuts';
import { useShell, useShellActions } from './store';
import { useTabDrag } from './tabDrag';
import { useStripReport, useVisit, useVisitorSlides } from './tabVisit';
import { adjacentTab, Cycle } from '../../lib/page/tabCycle';
import { preloadDelay, resting } from '../../lib/page/resting';
import { revealTab, sidewaysDelta, useOverflowing } from './tabStrip';
import { leaving, usePlacedTabs } from './tabMotions';
import { tabMenuItems, newTabTrigger } from './tabMenus';

function tabContent(tab: TabInfo, onClose?: () => void): React.ReactNode[] {
  return [
    <span key="divider" className="tab-divider" />,
    <ToolIcon key="icon" tool={tab.tool} />,
    <span key="name" className="tab-name">
      {tab.name}
    </span>,
    tab.unsaved === true && (
      <span key="unsaved" className="tab-unsaved">
        {strings.symbols.unsaved}
      </span>
    ),
    tab.folder !== undefined && (
      <span key="folder" className="tab-folder">
        {tab.folder}
      </span>
    ),
    <button
      key="close"
      className="tab-close"
      {...labelled(strings.common.close)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onClose?.();
      }}
    >
      <CloseIcon />
    </button>,
  ];
}

const noTabs: readonly TabInfo[] = [];

const shownAsFile: readonly ToolId[] = ['viewer', 'editor'];

function tabTip({ root, name, tool, compared }: TabInfo): Sentence {
  if (compared !== undefined) {
    return compared.old === compared.new
      ? [namedFile(compared.new)]
      : strings.common.filesCompared(compared.old, compared.new);
  }
  return root === undefined
    ? name
    : [shownAsFile.includes(tool) ? namedFile(root) : namedFolder(root)];
}

export function TabBar({ menu }: { menu?: React.ReactNode }) {
  const elevated = useShell((state) => state.about?.elevated);
  const tabs = useShell((state) => state.tabs ?? noTabs);
  const known = useShell((state) => state.tabs !== undefined);
  const active = useShell((state) => state.active);
  const windows = useShell((state) => state.windows);
  const tearsOff = useShell((state) => state.tearsOff);
  const visit = useShell((state) => state.visit);
  const adding = useShell(
    (state) => state.menu?.menu.trigger === newTabTrigger,
  );
  const {
    selectTab: onSelect,
    preloadTab: onPreload,
    closeTab: onClose,
    moveTab: onMove,
    moveTabToWindow,
    tearTab,
    dragTabTo,
    dropTab,
    cancelTabDrag,
    reportStrip,
    visitIndex,
    log: onLog,
    showMenu,
    closeMenu,
  } = useShellActions();
  const onAdd = (event: React.MouseEvent) => {
    if (adding) {
      closeMenu();
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    showMenu({
      x: button.left,
      y: button.bottom,
      items: [],
      trigger: newTabTrigger,
    });
  };
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  const overflowing = useOverflowing(strip, list);
  const tears = tearsOff && (tabs.length > 1 || windows.length > 0);
  const drag = useTabDrag(
    strip,
    tabs,
    active,
    onSelect,
    onMove,
    tears
      ? {
          tear: tearTab,
          to: dragTabTo,
          drop: dropTab,
          cancel: cancelTabDrag,
        }
      : undefined,
  );
  useStripReport(bar, list, strip, reportStrip);
  const shown = useVisit(strip, drag.elements, drag.shown, visit, visitIndex);
  const visitor = visit?.tab.id;
  const dragging = drag.dragged !== undefined;
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  const { placed, settled } = usePlacedTabs(shown, visitor, known);
  useVisitorSlides(drag.elements, visitor);
  const activeOpening = placed.some(
    ({ tab, motion }) => tab.id === active && motion === 'opening',
  );
  useEffect(() => {
    if (!overflowing || dragging) {
      return undefined;
    }
    revealTab(strip.current, activeIndex);
    if (!activeOpening) {
      return undefined;
    }
    let frame = requestAnimationFrame(function follow() {
      revealTab(strip.current, activeIndex);
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [overflowing, activeIndex, dragging, activeOpening]);
  const open = drag.dragged ?? active;

  useEffect(() => {
    requestAnimationFrame(() => {
      onLog(
        strings.log.layout(
          window.innerWidth,
          window.innerHeight,
          window.devicePixelRatio,
          elementWidth(document.body),
          elementWidth(bar.current),
          elementWidth(list.current),
        ),
      );
    });
  }, [onLog]);

  const rest = useMemo(() => resting(preloadDelay), []);
  useEffect(() => rest.cancel, [rest]);

  const add = useRef<HTMLButtonElement>(null);
  useBinding(shellKeymap.newTab, () => add.current?.click());
  const [cycle] = useState(() => new Cycle());
  useEffect(() => cycle.seen(active), [cycle, active]);
  useBinding(shellKeymap.tab, (step) => {
    const id = cycle.next(active, (from) => adjacentTab(tabs, from, step));
    if (id !== undefined) {
      onSelect(id);
    }
  });

  return (
    <nav
      className={tears && windows.length > 0 ? 'tabs tearing' : 'tabs'}
      ref={bar}
      style={{ minHeight: titleBarHeight }}
    >
      {menu}
      {elevated !== undefined && (
        <span
          className="app-elevated"
          {...tip(strings.tabs.elevated[elevated])}
        >
          <ShieldIcon />
        </span>
      )}
      <div className="tab-list" ref={list}>
        <div
          className={overflowing ? 'tab-strip overflowing' : 'tab-strip'}
          ref={strip}
          role="tablist"
          aria-label={strings.tabs.tabs}
          {...drag.dragging}
          onWheel={(event) => {
            event.currentTarget.scrollLeft += sidewaysDelta(
              event.deltaX,
              event.deltaY,
            );
          }}
        >
          {placed.map(({ tab, motion }) =>
            leaving(motion) ? (
              <div
                key={tab.id}
                className={`tab closing ${motion === 'departing' ? 'departing' : ''}`}
                aria-hidden
                inert
                onAnimationEnd={(event) =>
                  event.target === event.currentTarget && settled(tab.id)
                }
              >
                {tabContent(tab)}
              </div>
            ) : (
              <div
                key={tab.id}
                ref={drag.element(tab.id)}
                role="tab"
                aria-selected={tab.id === open}
                className={`tab ${tab.id === open || tab.id === visitor ? 'active' : ''} ${tab.id === drag.dragged || tab.id === visitor ? 'dragging' : ''} ${motion ?? ''}`}
                {...tip(tabTip(tab))}
                {...drag.pressing(tab.id)}
                onClick={() => {
                  rest.cancel();
                  onSelect(tab.id);
                }}
                onPointerEnter={() =>
                  tab.id !== active && rest.start(() => onPreload(tab.id))
                }
                onPointerLeave={rest.cancel}
                onMouseDown={(event) => event.preventDefault()}
                onAuxClick={(event) =>
                  clicked(shellKeymap.closeTab, event) && onClose(tab.id)
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  showMenu({
                    x: event.clientX,
                    y: event.clientY,
                    items: tabMenuItems(
                      tab.id,
                      tabs.length < 2,
                      windows,
                      moveTabToWindow,
                    ),
                  });
                }}
                onAnimationEnd={(event) =>
                  event.target === event.currentTarget && settled(tab.id)
                }
              >
                {tabContent(tab, () => onClose(tab.id))}
              </div>
            ),
          )}
        </div>
        <button
          ref={add}
          className={`nav-button tab-add ${adding ? 'open' : ''}`}
          {...labelled(strings.tabs.newTab)}
          aria-haspopup="menu"
          aria-expanded={adding}
          onClick={onAdd}
        >
          <AddIcon />
        </button>
      </div>
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
