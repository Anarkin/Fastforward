import { sameRoot } from '../../../lib/main/paths';
import { KeptTabs } from '../../../shell/main/keptTabs';
import type { Page, ShellAccess, Tab } from '../../../shell/main/toolContract';

const shownKept = 2;

export class KeptGitTabs {
  private readonly worktrees = new KeptTabs();
  private readonly compares = new KeptTabs();
  private readonly shown = new WeakMap<Page, readonly string[]>();

  constructor(private readonly shell: () => ShellAccess) {}

  ready(page: Page): void {
    this.worktrees.ready(page);
    this.compares.ready(page);
  }

  showing(page: Page, tab: string): void {
    const before = (this.shown.get(page) ?? []).filter((each) => each !== tab);
    this.shown.set(page, [tab, ...before].slice(0, shownKept));
  }

  keepWorktree(
    page: Page,
    repository: string,
    root: string,
    kept: unknown,
  ): void {
    const held = this.holds(
      page,
      (tab) =>
        tab.tool === 'git' &&
        tab.compare === undefined &&
        tab.root !== undefined &&
        sameRoot(tab.root, repository),
    );
    if (held !== 'no') {
      this.worktrees.keep(root, kept, held === 'window' ? page : undefined);
    }
  }

  keepCompare(page: Page, tab: string, kept: unknown): void {
    const held = this.holds(
      page,
      (each) =>
        each.id === tab && each.tool === 'git' && each.compare !== undefined,
    );
    if (held !== 'no') {
      this.compares.keep(tab, kept, held === 'window' ? page : undefined);
    }
  }

  leftWorktree(page: Page, root: string): void {
    this.worktrees.leftBy(page, root);
  }

  leftCompare(page: Page, tab: string): void {
    this.compares.leftBy(page, tab);
  }

  worktreeHandedTo(page: Page, root: string): string | undefined {
    return this.worktrees.handedTo(page, root);
  }

  compareHandedTo(page: Page, tab: string): string | undefined {
    return this.compares.handedTo(page, tab);
  }

  forgetWorktree(root: string): void {
    this.worktrees.drop(root);
  }

  forgetCompare(tab: string): void {
    this.compares.drop(tab);
  }

  private holds(
    page: Page,
    ours: (tab: Tab) => boolean,
  ): 'window' | 'shown' | 'no' {
    const shell = this.shell();
    const shown = this.shown.get(page) ?? [];
    if (shell.tabsOf(page).some(ours)) {
      return 'window';
    }
    return shell.tabs().some((tab) => shown.includes(tab.id) && ours(tab))
      ? 'shown'
      : 'no';
  }
}
