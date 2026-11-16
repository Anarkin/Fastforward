export class KeptPlaces<T> {
  private readonly places = new Map<string, T>();

  constructor(private readonly limit = 200) {}

  of(key: string): T | undefined {
    return this.places.get(key);
  }

  entries(): [string, T][] {
    return [...this.places];
  }

  forget(key: string): void {
    this.places.delete(key);
  }

  keep(key: string, place: T): void {
    this.places.delete(key);
    this.places.set(key, place);
    for (const oldest of this.places.keys()) {
      if (this.places.size <= this.limit) {
        return;
      }
      this.places.delete(oldest);
    }
  }
}
