import { KeptTabs } from '../../../shell/main/keptTabs';
import type { Page, ShellAccess, Tab } from '../../../shell/main/toolContract';

export class KeptCommanderTabs {
  private readonly kept = new KeptTabs();
  private readonly left = new WeakMap<Page, string>();

  constructor(private readonly shell: () => ShellAccess) {}

  ready(page: Page): void {
    this.kept.ready(page);
  }

  leaving(page: Page, tab: string | undefined): void {
    if (tab !== undefined) {
      this.left.set(page, tab);
    }
  }

  keep(page: Page, tab: unknown, kept: unknown): void {
    if (typeof tab !== 'string') {
      return;
    }
    const ours = (each: Tab) => each.id === tab && each.tool === 'commander';
    const shell = this.shell();
    if (
      shell.tabsOf(page).some(ours) ||
      (this.left.get(page) === tab && shell.tabs().some(ours))
    ) {
      this.kept.keep(tab, kept, page);
    }
  }

  handedTo(page: Page, tab: string): { readonly kept?: unknown } {
    const kept = this.kept.handedTo(page, tab);
    return kept === undefined ? {} : { kept };
  }

  closed(tab: string): void {
    this.kept.drop(tab);
  }
}
