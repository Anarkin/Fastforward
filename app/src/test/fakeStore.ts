import type { Store } from '../storage';

export class FakeStore implements Store {
  readonly values = new Map<string, unknown>();

  get(key: string): unknown {
    return this.values.get(key);
  }

  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}
