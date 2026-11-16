export const mostWorktrees = 20;

export class TabWorktrees {
  private readonly worktrees = new Map<string, readonly string[]>();
  private readonly compares = new Set<string>();

  shown(tab: string, root: string): void {
    const before = (this.worktrees.get(tab) ?? []).filter(
      (each) => each !== root,
    );
    this.worktrees.set(tab, [...before, root].slice(-mostWorktrees));
  }

  compared(tab: string): void {
    this.compares.add(tab);
  }

  of(tab: string): readonly string[] {
    return this.worktrees.get(tab) ?? [];
  }

  isCompare(tab: string): boolean {
    return this.compares.has(tab);
  }

  knows(tab: string): boolean {
    return this.worktrees.has(tab) || this.compares.has(tab);
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
    this.compares.delete(tab);
  }
}
