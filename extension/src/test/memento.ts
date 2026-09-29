import type * as vscode from 'vscode';

export class FakeMemento implements vscode.Memento {
  readonly values = new Map<string, unknown>();
  synced: readonly string[] = [];

  keys(): readonly string[] {
    return [...this.values.keys()];
  }

  get<T>(key: string, defaultValue?: T): T {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T;
  }

  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  setKeysForSync(keys: readonly string[]): void {
    this.synced = keys;
  }
}
