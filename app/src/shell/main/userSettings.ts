import { toolSettingProblems } from '../shared/tools';
import { strings } from '../../lib/shared/strings';
import type { Sentence } from '../../lib/shared/sentences';
import { type ImageView, type TextView } from '../shared/views';
import { isObject, type Json } from '../../lib/main/json';
import { readText, writeAtomically } from '../../lib/main/textFiles';
import {
  merge,
  mergeSettings,
  same,
  valueAt,
  withValue,
  type Settings,
} from './settings';
import { migratedSettings } from './settingsMigration';

export class UserSettings {
  private current: Settings;
  private inMemory: Json = {};
  private broken = false;
  private issues: readonly Sentence[] = [];
  private writing: Promise<void> = Promise.resolve();
  private readonly unsaved = new Map<
    string,
    {
      readonly keys: readonly string[];
      readonly value: unknown;
      readonly saves: number;
    }
  >();

  constructor(
    private base: Settings,
    private readonly file?: string,
  ) {
    this.current = base;
    this.read();
  }

  get defaults(): Settings {
    return this.base;
  }

  get settings(): Settings {
    return this.current;
  }

  get problems(): readonly Sentence[] {
    return this.issues;
  }

  replaceDefaults(defaults: Settings): boolean {
    const before = JSON.stringify([this.base, this.current, this.issues]);
    this.base = defaults;
    this.read();
    return JSON.stringify([this.base, this.current, this.issues]) !== before;
  }

  reload(): boolean {
    const before = JSON.stringify([this.current, this.issues]);
    this.read();
    return JSON.stringify([this.current, this.issues]) !== before;
  }

  private read(): void {
    if (this.file === undefined) {
      const { settings, problems } = mergeSettings(this.base, this.inMemory);
      this.current = settings;
      this.issues = [...problems, ...toolSettingProblems(settings.tools)];
      return;
    }
    const text = readText(this.file);
    this.broken = false;
    if (text instanceof Error) {
      this.broken = true;
      this.issues = [strings.settings.unreadable(text.message)];
      return;
    }
    if (text === undefined || text.trim() === '') {
      this.current = this.withUnsaved(this.base);
      this.issues = [];
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      this.broken = true;
      this.issues = [
        strings.settings.invalid(
          error instanceof Error ? error.message : String(error),
        ),
      ];
      return;
    }
    const migrated = isObject(parsed) ? migratedSettings(parsed) : undefined;
    if (migrated !== undefined) {
      parsed = migrated;
      this.saveMigrated(this.file, migrated);
    }
    const { settings, problems } = mergeSettings(this.base, parsed);
    this.current = this.withUnsaved(settings);
    this.broken = !isObject(parsed);
    this.issues = [...problems, ...toolSettingProblems(settings.tools)];
  }

  private saveMigrated(file: string, migrated: Json): void {
    this.writing = this.writing
      .catch(() => undefined)
      .then(() =>
        writeAtomically(file, `${JSON.stringify(migrated, undefined, 2)}\n`),
      );
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    return this.update([key], value);
  }

  setIn<
    T extends keyof Settings['tools'],
    K extends keyof Settings['tools'][T] & string,
  >(tool: T, key: K, value: Settings['tools'][T][K]): Promise<void> {
    return this.update(['tools', tool, key], value);
  }

  setTabs<K extends keyof Settings['tabs']>(
    key: K,
    value: Settings['tabs'][K],
  ): Promise<void> {
    return this.update(['tabs', key], value);
  }

  setText<K extends keyof TextView>(key: K, value: TextView[K]): Promise<void> {
    return this.update(['text', key], value);
  }

  setImages<K extends keyof ImageView>(
    key: K,
    value: ImageView[K],
  ): Promise<void> {
    return this.update(['images', key], value);
  }

  private update(keys: readonly string[], value: unknown): Promise<void> {
    const written: unknown = JSON.parse(JSON.stringify({ value })).value;
    const problems: Sentence[] = [];
    const settings = merge(
      this.current,
      withValue({}, keys, written),
      '',
      problems,
    );
    if (written === undefined || problems.length > 0) {
      return Promise.resolve();
    }
    this.current = settings;
    const file = this.file;
    if (file === undefined) {
      this.inMemory = this.withSetting(this.inMemory, keys, value);
      return Promise.resolve();
    }
    if (this.broken) {
      return Promise.resolve();
    }
    const key = keys.join('.');
    this.unsaved.set(key, {
      keys,
      value,
      saves: (this.unsaved.get(key)?.saves ?? 0) + 1,
    });
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => {
        const latest = writtenIn(file);
        if (latest === undefined) {
          return Promise.resolve();
        }
        return writeAtomically(
          file,
          `${JSON.stringify(this.withSetting(latest, keys, value), undefined, 2)}\n`,
        );
      })
      .finally(() => {
        const unsaved = this.unsaved.get(key);
        if (unsaved === undefined || unsaved.saves <= 1) {
          this.unsaved.delete(key);
        } else {
          this.unsaved.set(key, { ...unsaved, saves: unsaved.saves - 1 });
        }
      });
    return this.writing;
  }

  private withUnsaved(settings: Settings): Settings {
    let overrides: Json = {};
    for (const { keys, value } of this.unsaved.values()) {
      overrides = withValue(overrides, keys, value);
    }
    return merge(settings, overrides, '', []);
  }

  saved(): Promise<void> {
    return this.writing.catch(() => undefined);
  }

  private withSetting(
    written: Json,
    keys: readonly string[],
    value: unknown,
  ): Json {
    return withValue(
      written,
      keys,
      same(value, valueAt(this.base, keys)) ? undefined : value,
    );
  }
}

function writtenIn(file: string): Json | undefined {
  const text = readText(file);
  if (text instanceof Error) {
    return undefined;
  }
  if (text === undefined || text.trim() === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
