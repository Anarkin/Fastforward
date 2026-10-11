import { sameRoot } from './storage';

export type Timer = (run: () => void, ms: number) => () => void;

export const realTimer: Timer = (run, ms) => {
  const timeout = setTimeout(run, ms);
  return () => clearTimeout(timeout);
};

export function fetchOrder(
  tabs: readonly string[],
  activeTab: string | undefined,
): string[] {
  const active = tabs.filter(
    (tab) => activeTab !== undefined && sameRoot(tab, activeTab),
  );
  return [...active, ...tabs.filter((tab) => !active.includes(tab))];
}

export class AutoFetch {
  private cancel: (() => void) | undefined;
  private running = false;
  private readonly fetching = new Set<string>();

  constructor(
    private readonly minutes: () => number,
    private readonly roots: () => readonly string[],
    private readonly fetch: (root: string) => Promise<void>,
    private readonly timer: Timer = realTimer,
    private readonly now: () => number = Date.now,
    private readonly deadline: Timer = realTimer,
  ) {}

  update(now = false): void {
    this.cancel?.();
    this.cancel = undefined;
    if (now) {
      void this.round();
    } else {
      this.schedule();
    }
  }

  private schedule(roundStarted?: number): void {
    const minutes = this.minutes();
    if (minutes > 0 && !this.running) {
      const since = roundStarted === undefined ? 0 : this.now() - roundStarted;
      this.cancel = this.timer(
        () => void this.round(),
        Math.max(0, minutes * 60_000 - since),
      );
    }
  }

  private async round(): Promise<void> {
    if (this.running || this.minutes() <= 0) {
      return;
    }
    this.running = true;
    const started = this.now();
    try {
      for (const root of this.roots()) {
        const minutes = this.minutes();
        if (minutes <= 0) {
          break;
        }
        if (!this.fetching.has(root)) {
          await this.fetchAtMost(root, minutes * 60_000);
        }
      }
    } finally {
      this.running = false;
      this.schedule(started);
    }
  }

  private fetchAtMost(root: string, ms: number): Promise<void> {
    this.fetching.add(root);
    const fetched = this.fetch(root)
      .catch(() => undefined)
      .finally(() => this.fetching.delete(root));
    return new Promise((resolve) => {
      const cancel = this.deadline(resolve, ms);
      void fetched.then(() => {
        cancel();
        resolve();
      });
    });
  }
}
