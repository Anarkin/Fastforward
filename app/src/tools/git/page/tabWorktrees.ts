export const mostWorktrees = 20;

export class TabWorktrees {
  private readonly worktrees = new Map<string, readonly string[]>();

  shown(tab: string, root: string): void {
    const before = (this.worktrees.get(tab) ?? []).filter(
      (each) => each !== root,
    );
    this.worktrees.set(tab, [...before, root].slice(-mostWorktrees));
  }

  of(tab: string): readonly string[] {
    return this.worktrees.get(tab) ?? [];
  }

  knows(tab: string): boolean {
    return this.worktrees.has(tab);
  }

  tabOf(root: string): string | undefined {
    for (const [tab, roots] of this.worktrees) {
      if (roots.includes(root)) {
        return tab;
      }
    }
    return undefined;
  }

  forget(tab: string): void {
    this.worktrees.delete(tab);
  }
}
