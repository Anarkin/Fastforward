export class RecentCache<T> {
  private readonly held = new Map<string, T | undefined>();

  constructor(private readonly most: number) {}

  shown(tab: string): void {
    const value = this.held.get(tab);
    this.held.delete(tab);
    this.held.set(tab, value);
    for (const oldest of this.held.keys()) {
      if (this.held.size <= this.most) {
        return;
      }
      this.held.delete(oldest);
    }
  }

  holds(tab: string): boolean {
    return this.held.has(tab);
  }

  of(tab: string): T | undefined {
    return this.held.get(tab);
  }

  keep(tab: string, value: T): void {
    if (this.held.has(tab)) {
      this.held.set(tab, value);
    }
  }

  forget(tab: string): void {
    this.held.delete(tab);
  }
}
