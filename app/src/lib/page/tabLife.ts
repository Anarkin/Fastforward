import type { Schema } from '../shared/schema';
import { ViewKeeper, type KeptViews } from './viewKeeper';

export interface TabViews<V> {
  readonly viewOf: (tab: string) => V;
  readonly restore: (tab: string, view: V) => void;
  readonly forget: (tab: string) => void;
}

function parsedOf(view: string): unknown {
  try {
    return JSON.parse(view);
  } catch {
    return undefined;
  }
}

export class TabLife<V> {
  private readonly known = new Set<string>();
  private readonly shownWhenReleased = new Set<string>();
  private readonly keeper: ViewKeeper;

  constructor(
    views: KeptViews,
    private readonly schema: Schema<V>,
    private readonly tabViews: TabViews<V>,
    shown: () => string | undefined,
  ) {
    this.keeper = new ViewKeeper(views, (tab) => this.encoded(tab), shown);
  }

  showing(tab: string, leaving: string | undefined): void {
    this.known.add(tab);
    if (leaving === tab) {
      return;
    }
    const handed = this.keeper.handed(tab);
    const view =
      handed === undefined ? undefined : this.schema.decode(parsedOf(handed));
    if (view !== undefined) {
      this.tabViews.restore(tab, view);
    }
  }

  settled(leaving: string | undefined, shown: string | undefined): void {
    if (leaving === undefined || leaving === shown) {
      return;
    }
    if (this.shownWhenReleased.delete(leaving)) {
      this.letGo(leaving);
    } else {
      this.keeper.left(leaving);
    }
  }

  closed(tab: string): void {
    this.shownWhenReleased.delete(tab);
    this.letGo(tab);
  }

  changed(tab: string | undefined): void {
    this.keeper.changed(tab);
  }

  flush(): void {
    this.keeper.flush();
  }

  release(tab: string, shown: string | undefined): string | undefined {
    if (!this.known.has(tab)) {
      return undefined;
    }
    const view = this.keeper.release(tab);
    if (shown === tab) {
      this.shownWhenReleased.add(tab);
    } else {
      this.letGo(tab);
    }
    return view;
  }

  private encoded(tab: string): string | undefined {
    if (!this.known.has(tab)) {
      return undefined;
    }
    const encoded = this.schema.encode(this.tabViews.viewOf(tab));
    return encoded === undefined ? undefined : JSON.stringify(encoded);
  }

  private letGo(tab: string): void {
    this.known.delete(tab);
    this.keeper.forget(tab);
    this.tabViews.forget(tab);
  }
}
