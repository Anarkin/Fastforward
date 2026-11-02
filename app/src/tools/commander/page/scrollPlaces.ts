export class ScrollPlaces {
  private readonly offsets = new Map<string, number>();

  constructor(private readonly limit = 200) {}

  of(key: string): number {
    return this.offsets.get(key) ?? 0;
  }

  keep(key: string, offset: number): void {
    this.offsets.delete(key);
    this.offsets.set(key, offset);
    for (const oldest of this.offsets.keys()) {
      if (this.offsets.size <= this.limit) {
        return;
      }
      this.offsets.delete(oldest);
    }
  }
}
