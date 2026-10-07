import { sameRoot } from './storage';

export type Timer = (run: () => void, ms: number) => () => void;

const realTimer: Timer = (run, ms) => {
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

  constructor(
    private readonly minutes: () => number,
    private readonly roots: () => readonly string[],
    private readonly fetch: (root: string) => Promise<void>,
    private readonly timer: Timer = realTimer,
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

  private schedule(): void {
    const minutes = this.minutes();
    if (minutes > 0 && !this.running) {
      this.cancel = this.timer(() => void this.round(), minutes * 60_000);
    }
  }

  private async round(): Promise<void> {
    if (this.running || this.minutes() <= 0) {
      return;
    }
    this.running = true;
    try {
      for (const root of this.roots()) {
        if (this.minutes() <= 0) {
          break;
        }
        await this.fetch(root).catch(() => undefined);
      }
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}
