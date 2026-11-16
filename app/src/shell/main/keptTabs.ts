import type { Page } from './toolContract';

interface Kept {
  readonly kept: string;
  readonly from: Page | undefined;
}

export class KeptTabs {
  private readonly kept = new Map<string, Kept>();
  private readonly readied = new WeakSet<Page>();

  constructor(private readonly max = 1024 * 1024) {}

  ready(page: Page): void {
    this.readied.add(page);
  }

  keep(tab: string, kept: unknown, from: Page | undefined): boolean {
    if (typeof kept !== 'string' || kept.length > this.max) {
      return false;
    }
    this.kept.set(tab, {
      kept,
      from: from !== undefined && this.readied.has(from) ? from : undefined,
    });
    return true;
  }

  leftBy(page: Page, tab: string): void {
    const kept = this.kept.get(tab);
    if (kept?.from === page) {
      this.kept.set(tab, { kept: kept.kept, from: undefined });
    }
  }

  of(tab: string): Kept | undefined {
    return this.kept.get(tab);
  }

  handedTo(page: Page, tab: string): string | undefined {
    const kept = this.kept.get(tab);
    return kept === undefined || kept.from === page ? undefined : kept.kept;
  }

  drop(tab: string): void {
    this.kept.delete(tab);
  }
}
