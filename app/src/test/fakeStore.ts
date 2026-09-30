import type { Store } from '../storage';

export class FakeStore implements Store {
  readonly values = new Map<string, unknown>();

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as
      T | undefined;
  }

  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}
