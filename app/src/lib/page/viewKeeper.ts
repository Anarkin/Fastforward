export const keepingWait = 300;

export interface KeptViews {
  readonly of: (tab: string) => string | undefined;
  readonly keep: (tab: string, view: string) => void;
}

export class ViewKeeper {
  private readonly sent = new Map<string, string>();
  private readonly due = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private soon = false;

  constructor(
    private readonly views: KeptViews,
    private readonly viewOf: (tab: string) => string | undefined,
    private readonly shown: () => string | undefined,
    private readonly wait = keepingWait,
  ) {}

  changed(tab: string | undefined): void {
    if (tab === undefined) {
      return;
    }
    this.due.add(tab);
    const soon = tab !== this.shown();
    if (this.timer !== undefined && (this.soon || !soon)) {
      return;
    }
    clearTimeout(this.timer);
    this.soon = soon;
    this.timer = setTimeout(() => this.flush(), soon ? 0 : this.wait);
  }

  left(tab: string | undefined): void {
    if (tab !== undefined) {
      this.due.add(tab);
      this.flush();
    }
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const due = [...this.due];
    this.due.clear();
    for (const tab of due) {
      const view = this.viewOf(tab);
      if (view !== undefined && this.sent.get(tab) !== view) {
        this.sent.set(tab, view);
        this.views.keep(tab, view);
      }
    }
  }

  handed(tab: string): string | undefined {
    const view = this.views.of(tab);
    if (view === undefined || view === this.sent.get(tab)) {
      return undefined;
    }
    this.sent.set(tab, view);
    return view;
  }

  release(tab: string): string | undefined {
    const view = this.viewOf(tab);
    this.forget(tab);
    return view;
  }

  forget(tab: string): void {
    this.due.delete(tab);
    this.sent.delete(tab);
  }
}
