import type { Bounds } from './files';
import { tabMagnetism } from '../shell/shared/titleBar';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Strip {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly firstTabLeft: number;
  readonly tabTop: number;
}

export interface DragWindow {
  readonly id: string;
  bounds(): Bounds;
  contentBounds(): Bounds;
  strip(): Strip | undefined;
  shown(): boolean;
  moveTo(x: number, y: number): void;
  hide(hidden: boolean): void;
}

export interface Visit {
  readonly tab: string;
  readonly x: number;
  readonly grabX: number;
}

export interface DragHost {
  windows(): readonly DragWindow[];
  tearOff(tab: string, from: string): DragWindow | undefined;
  visit(window: string, visit: Visit | undefined): void;
  move(tab: string, into: string, index: number): void;
  focus(window: string): void;
}

export interface DragStart {
  readonly tab: string;
  readonly index: number;
  readonly grab: Point;
  readonly at: Point;
  readonly alone: boolean;
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
  private readonly from: Bounds;

  private constructor(
    private readonly host: DragHost,
    readonly source: DragWindow,
    private readonly floating: DragWindow,
    private readonly started: DragStart,
    private readonly layout: Strip,
  ) {
    this.from = floating.bounds();
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
    drag.move(started.at);
    if (!started.alone && !drag.hidden) {
      floating.hide(false);
    }
    return drag;
  }

  get window(): string {
    return this.floating.id;
  }

  move(at: Point): void {
    const found = targetAt(this.host.windows(), at, this.floating);
    if (
      this.target !== undefined &&
      this.target.window.id !== found?.window.id
    ) {
      this.host.visit(this.target.window.id, undefined);
      this.target = undefined;
    }
    if (found !== undefined) {
      this.target ??= {
        window: found.window,
        index: stripIndex(found.window.strip(), found.x),
      };
      this.host.visit(found.window.id, {
        tab: this.started.tab,
        x: found.x,
        grabX: this.started.grab.x,
      });
      if (!this.hidden) {
        this.hidden = true;
        this.floating.hide(true);
      }
      return;
    }
    this.place(at);
    if (this.hidden) {
      this.hidden = false;
      this.floating.hide(false);
    }
  }

  index(window: string, index: number): void {
    if (this.target?.window.id === window) {
      this.target.index = index;
    }
  }

  drop(): void {
    const { target } = this;
    if (target === undefined) {
      this.host.focus(this.floating.id);
      return;
    }
    this.host.move(this.started.tab, target.window.id, target.index);
    this.host.visit(target.window.id, undefined);
    this.host.focus(target.window.id);
  }

  cancel(): void {
    if (this.target !== undefined) {
      this.host.visit(this.target.window.id, undefined);
      this.target = undefined;
    }
    if (this.started.alone) {
      this.floating.moveTo(this.from.x, this.from.y);
      this.floating.hide(false);
    } else {
      this.host.move(this.started.tab, this.source.id, this.started.index);
    }
    this.host.focus(this.source.id);
  }

  private place(at: Point): void {
    const bounds = this.floating.bounds();
    const content = this.floating.contentBounds();
    const strip = this.floating.strip() ?? this.layout;
    const x = Math.round(
      at.x - this.started.grab.x - strip.firstTabLeft - (content.x - bounds.x),
    );
    const y = Math.round(
      at.y - this.started.grab.y - strip.tabTop - (content.y - bounds.y),
    );
    if (bounds.x !== x || bounds.y !== y) {
      this.floating.moveTo(x, y);
    }
  }
}
