import * as fs from 'node:fs';
import * as path from 'node:path';
import { diffLayouts, type DiffLayout } from './shared/protocol';
import { strings } from './shared/strings';

export interface Settings {
  readonly collapseMerges: boolean;
  readonly showAllFiles: boolean;
  readonly entireFilePinned: boolean;
  readonly ignoreWhitespace: boolean;
  readonly wordWrap: boolean;
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

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonKind(value: unknown): 'boolean' | 'number' | 'string' | 'object' {
  const kind = typeof value;
  switch (kind) {
    case 'boolean':
    case 'number':
    case 'string':
      return kind;
    default:
      return 'object';
  }
}

function kindOf(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0
      ? strings.settings.listsOf[jsonKind(value[0])]
      : strings.settings.kinds.list;
  }
  return strings.settings.kinds[jsonKind(value)];
}

function sameKind(fallback: unknown, value: unknown): boolean {
  if (Array.isArray(fallback)) {
    return (
      Array.isArray(value) &&
      value.every((item) => typeof item === typeof fallback[0])
    );
  }
  return (
    !Array.isArray(value) &&
    isObject(value) === isObject(fallback) &&
    typeof value === typeof fallback
  );
}

const choices = new Map<string, readonly string[]>([
  ['diffLayout', diffLayouts],
]);

function merge(
  defaults: Json,
  overrides: Json,
  prefix: string,
  problems: string[],
): Json {
  const merged: Json = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    const name = `${prefix}${key}`;
    if (!Object.hasOwn(defaults, key)) {
      problems.push(strings.settings.unknown(name));
      continue;
    }
    const fallback = defaults[key];
    const allowed = choices.get(name);
    if (!sameKind(fallback, value)) {
      problems.push(strings.settings.shouldBe(name, kindOf(fallback)));
    } else if (allowed && !allowed.some((choice) => choice === value)) {
      problems.push(strings.settings.shouldBeOneOf(name, allowed));
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
      problems: [strings.settings.notObject],
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
    throw new Error(strings.errors.notObject(file));
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return parsed as unknown as Settings;
}

export class UserSettings {
  private current: Settings;
  private inMemory: Json = {};
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
      const { settings, problems } = mergeSettings(this.base, this.inMemory);
      this.current = settings;
      this.issues = problems;
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
      this.current = this.base;
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
    const { settings, problems } = mergeSettings(this.base, parsed);
    this.current = settings;
    this.broken = !isObject(parsed);
    this.issues = problems;
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    this.current = { ...this.current, [key]: value };
    const file = this.file;
    if (file === undefined) {
      this.inMemory = this.withSetting(this.inMemory, key, value);
      return Promise.resolve();
    }
    if (this.broken) {
      return Promise.resolve();
    }
    this.pending += 1;
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => {
        const latest = writtenIn(file);
        if (latest === undefined) {
          return Promise.resolve();
        }
        return writeAtomically(
          file,
          `${JSON.stringify(this.withSetting(latest, key, value), undefined, 2)}\n`,
        );
      })
      .finally(() => {
        this.pending -= 1;
      });
    return this.writing;
  }

  saved(): Promise<void> {
    return this.writing.catch(() => undefined);
  }

  private withSetting<K extends keyof Settings>(
    written: Json,
    key: K,
    value: Settings[K],
  ): Json {
    const result = { ...written };
    if (same(value, this.base[key])) {
      delete result[key];
    } else {
      result[key] = value;
    }
    return result;
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

function readText(file: string): string | Error | undefined {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    return isMissing(error)
      ? undefined
      : error instanceof Error
        ? error
        : new Error(String(error));
  }
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function watchSettings(
  file: string,
  onChange: () => void,
  delay = 200,
  target = realPath(file),
): () => void {
  let timer: NodeJS.Timeout | undefined;
  const watchers = [...new Set([file, target])].map((watched) =>
    fs.watch(path.dirname(watched), (_event, name) => {
      if (name === path.basename(watched)) {
        clearTimeout(timer);
        timer = setTimeout(onChange, delay);
      }
    }),
  );
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

function realPath(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

const renameRetryDelays = [10, 20, 40, 80, 160, 320, 640];

export async function writeAtomically(
  file: string,
  text: string,
  retryDelays: readonly number[] = renameRetryDelays,
): Promise<void> {
  const target = await fs.promises.realpath(file).catch(() => file);
  const temporary = `${target}.tmp`;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.promises.writeFile(temporary, text);
    await renameRetrying(temporary, target, retryDelays);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function renameRetrying(
  from: string,
  to: string,
  retryDelays: readonly number[],
): Promise<void> {
  for (const delay of retryDelays) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (error) {
      if (!isHeld(error)) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  await fs.promises.rename(from, to);
}

function isHeld(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EPERM' ||
      error.code === 'EACCES' ||
      error.code === 'EBUSY')
  );
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
