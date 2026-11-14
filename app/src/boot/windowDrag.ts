import type { BrowserWindow } from 'electron';
import type { Shell } from '../shell/main/shell';
import type { DragEvent, Strip } from '../shell/main/dragEvents';
import { showAgain } from './windowPlacement';
import {
  TabDrag,
  tearsOffTabs,
  type DragHost,
  type DragWindow,
} from './tabDrag';

export interface WindowDragHost {
  frontToBack(): readonly string[];
  windowOf(id: string): BrowserWindow | undefined;
  windowCount(): number;
  takeSpare(source: BrowserWindow): string | undefined;
  keepSpare(): void;
  close(id: string): void;
  asking(): Shell | undefined;
}

export class WindowDrag {
  private readonly strips = new Map<string, Strip>();
  private drag: TabDrag | undefined;
  private readonly dragHost: DragHost;

  constructor(private readonly host: WindowDragHost) {
    this.dragHost = {
      windows: () =>
        host.frontToBack().flatMap((id) => this.dragWindowOf(id) ?? []),
      tearOff: (tab, from) => {
        const source = host.windowOf(from);
        const asking = host.asking();
        if (source === undefined || asking === undefined) {
          return undefined;
        }
        const taken = host.takeSpare(source);
        if (taken === undefined) {
          return undefined;
        }
        void asking.tearOff(tab, taken);
        return this.dragWindowOf(taken);
      },
      visit: (window, visit) => host.asking()?.visit(window, visit),
      move: (tab, into, index) => void host.asking()?.moveTab(tab, into, index),
      close: (window) => host.close(window),
      focus: (window) => {
        const shown = host.windowOf(window);
        if (shown !== undefined && !shown.isDestroyed()) {
          shown.setAlwaysOnTop(false);
          shown.setOpacity(1);
          showAgain(shown);
        }
      },
    };
  }

  dragged(window: string, event: DragEvent): void {
    switch (event.kind) {
      case 'strip':
        this.strips.set(window, event.strip);
        return;
      case 'start': {
        const source = this.dragWindowOf(window);
        if (
          this.drag === undefined &&
          source !== undefined &&
          tearsOffTabs(process.platform, process.env) &&
          (!event.alone || this.host.windowCount() > 1)
        ) {
          this.drag = TabDrag.start(this.dragHost, source, event);
        }
        return;
      }
      case 'move':
        if (this.drag?.source.id === window) {
          this.drag.move(event.at);
        }
        return;
      case 'index':
        this.drag?.index(window, event.index);
        return;
      case 'drop':
      case 'cancel': {
        const ended = this.drag;
        if (ended?.source.id !== window) {
          return;
        }
        this.drag = undefined;
        if (event.kind === 'drop') {
          ended.drop();
        } else {
          ended.cancel();
        }
        this.host.keepSpare();
      }
    }
  }

  forget(id: string): void {
    this.strips.delete(id);
  }

  private dragWindowOf(id: string): DragWindow | undefined {
    const window = this.host.windowOf(id);
    if (window === undefined || window.isDestroyed()) {
      return undefined;
    }
    return {
      id,
      bounds: () => window.getBounds(),
      contentBounds: () => window.getContentBounds(),
      strip: () => this.strips.get(id),
      shown: () =>
        !window.isDestroyed() &&
        window.isVisible() &&
        !window.isMinimized() &&
        window.getOpacity() > 0,
      moveTo: (x, y) => {
        if (!window.isDestroyed()) {
          window.setPosition(x, y);
        }
      },
      hide: (hidden) => {
        if (window.isDestroyed()) {
          return;
        }
        window.setOpacity(hidden ? 0 : 1);
        if (hidden) {
          return;
        }
        if (!window.isVisible()) {
          window.showInactive();
        }
        window.setAlwaysOnTop(true);
      },
    };
  }
}
