import type { Page } from './toolContract';

interface Kept {
  readonly kept: unknown;
  readonly from: Page | undefined;
}

const lengthOf = (value: unknown): number | undefined => {
  try {
    return JSON.stringify(value)?.length;
  } catch {
    return undefined;
  }
};

export class KeptTabs {
  private readonly kept = new Map<string, Kept>();
  private readonly readied = new WeakSet<Page>();

  constructor(private readonly max = 1024 * 1024) {}

  ready(page: Page): void {
    this.readied.add(page);
  }

  keep(tab: string, kept: unknown, from: Page): boolean {
    const length = lengthOf(kept);
    if (length === undefined || length > this.max) {
      return false;
    }
    this.kept.set(tab, {
      kept,
      from: this.readied.has(from) ? from : undefined,
    });
    return true;
  }

  of(tab: string): Kept | undefined {
    return this.kept.get(tab);
  }

  handedTo(page: Page, tab: string): unknown {
    const kept = this.kept.get(tab);
    return kept === undefined || kept.from === page ? undefined : kept.kept;
  }

  drop(tab: string): void {
    this.kept.delete(tab);
  }
}
