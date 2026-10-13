import { useEffect, useMemo, useRef, useState } from 'react';
import { type TabInfo } from '../shared/protocol';
import { CloseIcon } from './icons';
import { clicked, keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { useBinding } from './shortcuts';

export function adjacentTab(
  tabs: readonly TabInfo[],
  active: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (tabs.length < 2) {
    return undefined;
  }
  const index = tabs.findIndex((tab) => tab.root === active);
  const next = index === -1 ? 0 : (index + step + tabs.length) % tabs.length;
  return tabs[next].root;
}

export class Cycle {
  private asked: string[] = [];
  private shown: string | undefined;

  seen(shown: string | undefined): void {
    if (shown !== this.shown) {
      this.shown = shown;
      const reached = shown === undefined ? -1 : this.asked.indexOf(shown);
      this.asked = reached === -1 ? [] : this.asked.slice(reached + 1);
    }
  }

  next(
    active: string | undefined,
    adjacent: (from: string | undefined) => string | undefined,
  ): string | undefined {
    this.seen(active);
    const next = adjacent(this.asked.at(-1) ?? active);
    if (next !== undefined) {
      this.asked.push(next);
    }
    return next;
  }
}

export const preloadDelay = 200;

export function resting(delay: number): {
  start: (action: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  return {
    start: (action) => {
      cancel();
      timer = setTimeout(action, delay);
    },
    cancel,
  };
}

export function TabBar({
  tabs,
  active,
  onSelect,
  onPreload,
  onClose,
  onAdd,
  onLog,
}: {
  tabs: readonly TabInfo[];
  active: string | undefined;
  onSelect: (root: string) => void;
  onPreload: (root: string) => void;
  onClose: (root: string) => void;
  onAdd: (event: React.MouseEvent) => void;
  onLog: (message: string) => void;
}) {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);

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
  useBinding(keymap.openRepository, () => add.current?.click());
  const [cycle] = useState(() => new Cycle());
  useEffect(() => cycle.seen(active), [cycle, active]);
  useBinding(keymap.repository, (step) => {
    const root = cycle.next(active, (from) => adjacentTab(tabs, from, step));
    if (root !== undefined) {
      onSelect(root);
    }
  });

  return (
    <nav className="tabs" ref={bar}>
      <div
        className="tab-list"
        ref={list}
        role="tablist"
        aria-label={strings.tabs.repositories}
      >
        {tabs.map((tab) => (
          <div
            key={tab.root}
            role="tab"
            aria-selected={tab.root === active}
            className={`tab ${tab.root === active ? 'active' : ''}`}
            title={tab.root}
            onClick={() => {
              rest.cancel();
              onSelect(tab.root);
            }}
            onPointerEnter={() =>
              tab.root !== active && rest.start(() => onPreload(tab.root))
            }
            onPointerLeave={rest.cancel}
            onMouseDown={(event) =>
              clicked(keymap.closeRepository, event) && event.preventDefault()
            }
            onAuxClick={(event) =>
              clicked(keymap.closeRepository, event) && onClose(tab.root)
            }
          >
            <span className="tab-name">{tab.name}</span>
            {tab.folder !== undefined && (
              <span className="tab-folder">{tab.folder}</span>
            )}
            <button
              className="tab-close"
              title={strings.common.close}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.root);
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
        <button
          ref={add}
          className="tab-add"
          title={strings.actions.openRepository}
          onClick={onAdd}
        >
          {strings.symbols.add}
        </button>
      </div>
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
