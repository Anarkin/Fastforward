export class KeptPlaces<T> {
  private readonly places = new Map<string, T>();

  constructor(
    private readonly limit = 200,
    private readonly changed: (key: string) => void = () => undefined,
  ) {}

  of(key: string): T | undefined {
    return this.places.get(key);
  }

  entries(): [string, T][] {
    return [...this.places];
  }

  forget(key: string): void {
    if (this.places.delete(key)) {
      this.changed(key);
    }
  }

  keep(key: string, place: T): void {
    this.places.delete(key);
    this.places.set(key, place);
    this.changed(key);
    for (const oldest of this.places.keys()) {
      if (this.places.size <= this.limit) {
        return;
      }
      this.places.delete(oldest);
      this.changed(oldest);
    }
  }
}
