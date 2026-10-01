import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiffLayout } from './shared/protocol';

export interface Settings {
  readonly collapseMerges: boolean;
  readonly showAllFiles: boolean;
  readonly entireFilePinned: boolean;
  readonly ignoreWhitespace: boolean;
  readonly diffLayout: DiffLayout;
  readonly solo: boolean;
  readonly autoFetch: boolean;
  readonly autoFetchMinutes: number;
  readonly columnWidths: readonly number[];
  readonly fonts: {
    readonly family: string;
    readonly size: string;
    readonly monospaceFamily: string;
    readonly monospaceSize: string;
  };
  readonly sizes: {
    readonly scrollbar: string;
    readonly minimap: string;
  };
  readonly colors: {
    readonly light: Readonly<Record<string, string>>;
    readonly dark: Readonly<Record<string, string>>;
  };
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): string {
  return Array.isArray(value)
    ? 'a list'
    : isObject(value)
      ? 'an object'
      : `a ${typeof value}`;
}

function sameKind(fallback: unknown, value: unknown): boolean {
  if (Array.isArray(fallback)) {
    return (
      Array.isArray(value) &&
      value.every((item) => typeof item === typeof fallback[0])
    );
  }
  return kindOf(fallback) === kindOf(value);
}

function merge(
  defaults: Json,
  overrides: Json,
  prefix: string,
  problems: string[],
): Json {
  const merged: Json = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    const name = `${prefix}${key}`;
    const fallback = defaults[key];
    if (!(key in defaults)) {
      problems.push(`Unknown setting "${name}"`);
    } else if (!sameKind(fallback, value)) {
      problems.push(`"${name}" should be ${kindOf(fallback)}`);
    } else if (isObject(fallback) && isObject(value)) {
      merged[key] = merge(fallback, value, `${name}.`, problems);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export function mergeSettings<T extends object>(
  defaults: T,
  overrides: unknown,
): { settings: T; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(overrides)) {
    return {
      settings: defaults,
      problems: ['The user settings are not a JSON object'],
    };
  }
  const settings = merge(
    Object.fromEntries(Object.entries(defaults)),
    overrides,
    '',
    problems,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  ) as T;
  return { settings, problems };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function overridesOf(defaults: object, settings: object): Json {
  const fallback: Json = { ...defaults };
  const overrides: Json = {};
  for (const [key, value] of Object.entries(settings)) {
    const base = fallback[key];
    if (isObject(base) && isObject(value)) {
      const nested = overridesOf(base, value);
      if (Object.keys(nested).length > 0) {
        overrides[key] = nested;
      }
    } else if (!same(base, value)) {
      overrides[key] = value;
    }
  }
  return overrides;
}

export function readDefaults(file: string): Settings {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isObject(parsed)) {
    throw new Error(`${file} is not a JSON object`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return parsed as unknown as Settings;
}

export class UserSettings {
  private current: Settings;
  private written: Json = {};
  private broken = false;
  private issues: readonly string[] = [];
  private writing: Promise<void> = Promise.resolve();
  private pending = 0;

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

  get problems(): readonly string[] {
    return this.issues;
  }

  replaceDefaults(defaults: Settings): boolean {
    const before = JSON.stringify([this.base, this.current, this.issues]);
    this.base = defaults;
    this.read();
    return JSON.stringify([this.base, this.current, this.issues]) !== before;
  }

  reload(): boolean {
    if (this.pending > 0) {
      return false;
    }
    const before = JSON.stringify([this.current, this.issues]);
    this.read();
    return JSON.stringify([this.current, this.issues]) !== before;
  }

  private read(): void {
    if (this.file === undefined) {
      const { settings, problems } = mergeSettings(this.base, this.written);
      this.current = settings;
      this.issues = problems;
      return;
    }
    const text = readText(this.file);
    this.broken = false;
    if (text === undefined || text.trim() === '') {
      this.current = this.base;
      this.written = {};
      this.issues = [];
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      this.broken = true;
      this.issues = [
        `The user settings are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ];
      return;
    }
    const { settings, problems } = mergeSettings(this.base, parsed);
    this.current = settings;
    this.written = isObject(parsed) ? parsed : {};
    this.issues = problems;
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    this.current = { ...this.current, [key]: value };
    const written = { ...this.written };
    if (same(value, this.base[key])) {
      delete written[key];
    } else {
      written[key] = value;
    }
    this.written = written;
    const file = this.file;
    if (file === undefined || this.broken) {
      return Promise.resolve();
    }
    const json = `${JSON.stringify(written, undefined, 2)}\n`;
    this.pending += 1;
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => writeAtomically(file, json))
      .finally(() => {
        this.pending -= 1;
      });
    return this.writing;
  }

  saved(): Promise<void> {
    return this.writing.catch(() => undefined);
  }
}

function readText(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

export async function writeAtomically(
  file: string,
  text: string,
): Promise<void> {
  const temporary = `${file}.tmp`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(temporary, text);
  await fs.promises.rename(temporary, file);
}

const stateKeys = [
  'tabs',
  'activeTab',
  'recentRepositories',
  'windowBounds',
  'windowMaximized',
];

export function migrate(
  old: unknown,
  defaults: Settings,
): { overrides: Json; state: Json } {
  const source: Json = isObject(old) ? old : {};
  const state: Json = {};
  for (const key of stateKeys) {
    if (key in source) {
      state[key] = source[key];
    }
  }
  if (isObject(source.vips)) {
    state.bookmarks = source.vips;
  }
  if (Array.isArray(source.soloRepositories)) {
    state.solo = Object.fromEntries(
      source.soloRepositories
        .filter((root) => typeof root === 'string')
        .map((root) => [root, true]),
    );
  }
  const changed: Json = {};
  for (const key of [
    'collapseMerges',
    'entireFilePinned',
    'ignoreWhitespace',
    'columnWidths',
  ]) {
    if (key in source) {
      changed[key] = source[key];
    }
  }
  if ('filesMode' in source) {
    changed.showAllFiles = source.filesMode === 'files';
  }
  const { settings } = mergeSettings(defaults, changed);
  return { overrides: overridesOf(defaults, settings), state };
}

export function migrateProfile(folder: string, defaults: Settings): boolean {
  const old = path.join(folder, 'settings.json');
  const user = path.join(folder, 'settings.user.json');
  const state = path.join(folder, 'state.json');
  if (!fs.existsSync(old) || fs.existsSync(user) || fs.existsSync(state)) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(old, 'utf8'));
  } catch {
    parsed = {};
  }
  const migrated = migrate(parsed, defaults);
  fs.writeFileSync(state, `${JSON.stringify(migrated.state, undefined, 2)}\n`);
  if (Object.keys(migrated.overrides).length > 0) {
    fs.writeFileSync(
      user,
      `${JSON.stringify(migrated.overrides, undefined, 2)}\n`,
    );
  }
  fs.renameSync(old, path.join(folder, 'settings.old.json'));
  return true;
}

export function writeReadOnly(file: string, text: string): void {
  if (fs.existsSync(file)) {
    fs.chmodSync(file, 0o644);
  }
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o444);
}
