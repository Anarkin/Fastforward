export const keepingWait = 300;

export class TabKeeping {
  private readonly sent = new Map<string, string>();
  private readonly due = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private soon = false;

  constructor(
    private readonly keptOf: (tab: string) => unknown,
    private readonly send: (tab: string, kept: unknown) => void,
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
      const kept = this.keptOf(tab);
      const json = kept === undefined ? undefined : JSON.stringify(kept);
      if (json !== undefined && this.sent.get(tab) !== json) {
        this.sent.set(tab, json);
        this.send(tab, kept);
      }
    }
  }

  forget(tab: string): void {
    this.due.delete(tab);
    this.sent.delete(tab);
  }
}
