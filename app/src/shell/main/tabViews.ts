import type { Page } from './toolContract';

const maxViewChars = 1024 * 1024;

export const releaseWait = 200;

interface Kept {
  readonly view: string;
  readonly from: Page | undefined;
}

interface Releasing {
  readonly page: Page;
  readonly done: () => void;
}

export class TabViews {
  private readonly views = new Map<string, Kept>();
  private readonly readied = new WeakSet<Page>();
  private readonly releasing = new Map<string, Releasing>();
  private readonly settling = new Map<string, Promise<void>>();

  constructor(
    private readonly holds: (page: Page, tab: string) => boolean,
    private readonly pages: () => readonly Page[],
    private readonly max = maxViewChars,
  ) {}

  ready(page: Page): void {
    this.readied.add(page);
  }

  keep(page: Page, tab: unknown, view: unknown): boolean {
    if (typeof tab !== 'string') {
      return false;
    }
    const releasing = this.releasing.get(tab)?.page === page;
    if (!releasing && !this.holds(page, tab)) {
      return false;
    }
    if (typeof view !== 'string' || view.length > this.max) {
      this.views.delete(tab);
      return false;
    }
    this.views.set(tab, {
      view,
      from: !releasing && this.readied.has(page) ? page : undefined,
    });
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

  release(page: Page, tab: string): Promise<void> {
    const before = this.settling.get(tab);
    const next =
      before === undefined
        ? this.releaseNow(page, tab)
        : before.then(() => this.releaseNow(page, tab));
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
    this.releasing.set(tab, { page, done });
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
    this.releasing.get(tab)?.done();
    this.views.delete(tab);
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
