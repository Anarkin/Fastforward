import { maxViewChars } from '../shared/protocol';
import type { Page } from './toolContract';

export const releaseWait = 200;

interface Kept {
  readonly view: string;
  readonly from: Page | undefined;
}

interface Releasing {
  readonly page: Page;
  readonly done: () => void;
  overtaken: boolean;
}

export class TabViews {
  private readonly views = new Map<string, Kept>();
  private readonly readied = new WeakSet<Page>();
  private readonly releasing = new Map<string, Releasing>();
  private readonly settling = new Map<string, Promise<void>>();
  private readonly drops = new Map<string, number>();

  constructor(
    private readonly holds: (page: Page, tab: string) => boolean,
    private readonly pages: () => readonly Page[],
    private readonly changed: () => void = () => undefined,
    private readonly max = maxViewChars,
  ) {}

  restore(saved: ReadonlyMap<string, string>): void {
    for (const [tab, view] of saved) {
      this.views.set(tab, { view, from: undefined });
    }
  }

  entries(): (readonly [string, string])[] {
    return [...this.views].map(([tab, { view }]) => [tab, view] as const);
  }

  ready(page: Page): void {
    this.readied.add(page);
  }

  keep(page: Page, tab: unknown, view: unknown): boolean {
    if (typeof tab !== 'string') {
      return false;
    }
    const pending = this.releasing.get(tab);
    const releasing = pending?.page === page;
    if (releasing ? pending.overtaken : !this.holds(page, tab)) {
      return false;
    }
    if (pending !== undefined && !releasing) {
      pending.overtaken = true;
    }
    if (typeof view !== 'string' || view.length > this.max) {
      if (this.views.delete(tab)) {
        this.changed();
      }
      return false;
    }
    const was = this.views.get(tab)?.view;
    this.views.set(tab, {
      view,
      from: !releasing && this.readied.has(page) ? page : undefined,
    });
    if (was !== view) {
      this.changed();
    }
    return true;
  }

  released(page: Page, tab: unknown, view: unknown): void {
    if (typeof tab !== 'string') {
      return;
    }
    const releasing = this.releasing.get(tab);
    if (releasing?.page !== page) {
      return;
    }
    if (view !== '') {
      this.keep(page, tab, view);
    }
    releasing.done();
  }

  handTo(page: Page, tab: string): void {
    const kept = this.views.get(tab);
    if (kept !== undefined && kept.from !== page) {
      page.post({ type: 'view', tab, view: kept.view });
    }
  }

  settled(tab: string): Promise<void> | undefined {
    return this.settling.get(tab);
  }

  release(page: Page, tab: string): Promise<void> {
    const before = this.settling.get(tab);
    const dropped = this.drops.get(tab) ?? 0;
    const now = () =>
      (this.drops.get(tab) ?? 0) === dropped
        ? this.releaseNow(page, tab)
        : Promise.resolve();
    const next = before === undefined ? now() : before.then(now);
    this.settling.set(tab, next);
    void next.then(() => {
      if (this.settling.get(tab) === next) {
        this.settling.delete(tab);
      }
    });
    return next;
  }

  private releaseNow(page: Page, tab: string): Promise<void> {
    if (page.disposed) {
      this.lettingGo(page, tab);
      return Promise.resolve();
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    const timer = setTimeout(() => done(), releaseWait);
    const done = () => {
      clearTimeout(timer);
      if (this.releasing.get(tab)?.page === page) {
        this.releasing.delete(tab);
      }
      this.lettingGo(page, tab);
      resolve();
    };
    this.releasing.set(tab, { page, done, overtaken: false });
    page.post({ type: 'release', tab });
    return promise;
  }

  gone(page: Page): void {
    for (const releasing of this.releasing.values()) {
      if (releasing.page === page) {
        releasing.done();
      }
    }
  }

  drop(tab: string): void {
    this.drops.set(tab, (this.drops.get(tab) ?? 0) + 1);
    this.settling.delete(tab);
    this.releasing.get(tab)?.done();
    if (this.views.delete(tab)) {
      this.changed();
    }
    for (const page of this.pages()) {
      page.post({ type: 'release', tab });
    }
  }

  private lettingGo(page: Page, tab: string): void {
    const kept = this.views.get(tab);
    if (kept?.from === page) {
      this.views.set(tab, { view: kept.view, from: undefined });
    }
  }
}
