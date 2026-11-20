import type { Bounds } from './windowPlacement';
import type { DragStart, Point, Strip, Visit } from '../shell/main/dragEvents';
import { tabMagnetism } from '../shell/shared/tabDrag';

export interface DragWindow {
  readonly id: string;
  bounds(): Bounds;
  contentBounds(): Bounds;
  strip(): Strip | undefined;
  shown(): boolean;
  moveContentTo(x: number, y: number): void;
  hide(hidden: boolean): void;
  veil(): void;
}

export interface DragHost {
  windows(): readonly DragWindow[];
  tearOff(tab: string, from: string): DragWindow | undefined;
  visit(window: string, visit: Visit | undefined): void;
  move(tab: string, into: string, index: number): void;
  close(window: string): void;
  focus(window: string): void;
  soon(run: () => void): void;
}

interface Target {
  readonly window: DragWindow;
  readonly x: number;
}

function inside(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

function stripIndex(strip: Strip | undefined, x: number): number {
  return strip === undefined || x < strip.firstTabLeft
    ? 0
    : Number.MAX_SAFE_INTEGER;
}

function targetAt(
  windows: readonly DragWindow[],
  point: Point,
  excluded: DragWindow,
): Target | undefined {
  for (const window of windows) {
    if (window.id === excluded.id || !window.shown()) {
      continue;
    }
    const content = window.contentBounds();
    const strip = window.strip();
    const x = point.x - content.x;
    const y = point.y - content.y;
    if (
      strip !== undefined &&
      x >= strip.left &&
      x < strip.right &&
      y >= strip.top - tabMagnetism &&
      y < strip.bottom + tabMagnetism
    ) {
      return { window, x };
    }
    if (inside(point, window.bounds())) {
      return undefined;
    }
  }
  return undefined;
}

export class TabDrag {
  private target: { readonly window: DragWindow; index: number } | undefined;
  private hidden = false;
  private waiting = 0;
  private waited = 0;
  private at: Point;
  private readonly from: Bounds;

  private constructor(
    private readonly host: DragHost,
    readonly source: DragWindow,
    private readonly floating: DragWindow,
    private readonly started: DragStart,
    private readonly layout: Strip,
  ) {
    this.from = floating.contentBounds();
    this.at = started.at;
  }

  static start(
    host: DragHost,
    source: DragWindow,
    started: DragStart,
  ): TabDrag | undefined {
    const layout = source.strip();
    if (layout === undefined) {
      return undefined;
    }
    const floating = started.alone
      ? source
      : host.tearOff(started.tab, source.id);
    if (floating === undefined) {
      return undefined;
    }
    const drag = new TabDrag(host, source, floating, started, layout);
    if (!started.alone) {
      floating.veil();
      drag.waitForRow();
    }
    drag.move(started.at);
    return drag;
  }

  get window(): string {
    return this.floating.id;
  }

  move(at: Point): void {
    this.at = at;
    const found = targetAt(this.host.windows(), at, this.floating);
    const left = this.target;
    if (found !== undefined && !this.hidden) {
      this.hidden = true;
      this.floating.hide(true);
    }
    if (left?.window.id !== found?.window.id) {
      this.target =
        found === undefined
          ? undefined
          : {
              window: found.window,
              index: stripIndex(found.window.strip(), found.x),
            };
      if (this.target === undefined && !this.started.alone) {
        this.waitForRow();
      }
      this.host.move(
        this.started.tab,
        this.target?.window.id ?? this.floating.id,
        this.target?.index ?? 0,
      );
      if (left !== undefined) {
        this.host.visit(left.window.id, undefined);
      }
    }
    if (found !== undefined) {
      this.host.visit(found.window.id, {
        tab: this.started.tab,
        x: found.x,
        grabX: this.started.grab.x,
      });
      return;
    }
    this.place(at);
    if (this.hidden) {
      this.hidden = false;
      if (this.waiting === 0) {
        this.floating.hide(false);
      }
    }
  }

  stripped(window: string): void {
    if (
      window === this.floating.id &&
      this.waiting > 0 &&
      (this.floating.strip()?.tabs ?? 0) > 0
    ) {
      this.shown(this.waiting);
    }
  }

  private waitForRow(): void {
    this.waited += 1;
    const waiting = this.waited;
    this.waiting = waiting;
    this.host.soon(() => this.shown(waiting));
  }

  private shown(waiting: number): void {
    if (this.waiting !== waiting) {
      return;
    }
    this.waiting = 0;
    if (this.target === undefined && !this.hidden) {
      this.place(this.at);
      this.floating.hide(false);
    }
  }

  index(window: string, index: number): void {
    const { target } = this;
    if (target?.window.id === window && target.index !== index) {
      target.index = index;
      this.host.move(this.started.tab, window, index);
    }
  }

  drop(): void {
    const { target } = this;
    if (target === undefined) {
      if (this.waiting > 0) {
        this.shown(this.waiting);
      }
      this.host.focus(this.floating.id);
      return;
    }
    this.host.visit(target.window.id, undefined);
    this.host.close(this.floating.id);
    this.host.focus(target.window.id);
  }

  cancel(): void {
    const { target } = this;
    this.target = undefined;
    if (!this.started.alone || target !== undefined) {
      this.host.move(this.started.tab, this.source.id, this.started.index);
    }
    if (target !== undefined) {
      this.host.visit(target.window.id, undefined);
    }
    if (this.started.alone) {
      this.floating.moveContentTo(this.from.x, this.from.y);
      this.floating.hide(false);
    } else {
      this.host.close(this.floating.id);
    }
    this.host.focus(this.source.id);
  }

  private place(at: Point): void {
    const content = this.floating.contentBounds();
    const strip = this.floating.strip() ?? this.layout;
    const x = Math.round(at.x - this.started.grab.x - strip.firstTabLeft);
    const y = Math.round(at.y - this.started.grab.y - strip.tabTop);
    if (content.x !== x || content.y !== y) {
      this.floating.moveContentTo(x, y);
    }
  }
}

export function tearsOffTabs(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): boolean {
  return platform !== 'linux' || env.XDG_SESSION_TYPE !== 'wayland';
}
