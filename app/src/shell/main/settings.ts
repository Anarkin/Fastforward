import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  toolSettingChoices,
  toolSettingListKinds,
  toolSettingProblems,
  toolSettingStandIns,
  type ThemeColors,
  type ToolSettings,
} from '../shared/tools';
import { strings, type Sentence } from '../../shared/strings';
import {
  editorCharsets,
  editorEndings,
  indentStyles,
  type EditorSettings,
} from '../shared/editorSettings';
import {
  themes,
  type ImageView,
  type TextView,
  type Theme,
} from '../shared/protocol';

export interface Settings {
  readonly tabs: {
    readonly recentFolders: number;
  };
  readonly theme: Theme;
  readonly dateFormat: string;
  readonly scrolling: {
    readonly wheelRows: number;
    readonly smooth: boolean;
  };
  readonly text: TextView;
  readonly images: ImageView;
  readonly editor: EditorSettings;
  readonly tools: ToolSettings;
  readonly fonts: {
    readonly family: string;
    readonly size: string;
    readonly lineHeight: number;
    readonly monospaceFamily: string;
    readonly monospaceSize: string;
    readonly monospaceLineHeight: number;
  };
  readonly sizes: {
    readonly scrollbar: string;
    readonly minimap: string;
  };
  readonly colors: ThemeColors;
}

type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type JsonKind = 'boolean' | 'number' | 'string' | 'object';

function jsonKind(value: unknown): JsonKind {
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

function itemKind(
  name: string,
  fallback: readonly unknown[],
): JsonKind | undefined {
  return fallback.length > 0
    ? jsonKind(fallback[0])
    : toolSettingListKinds.get(name);
}

function wrongKind(name: string, fallback: unknown): Sentence {
  if (Array.isArray(fallback)) {
    const kind = itemKind(name, fallback);
    return kind === undefined
      ? strings.settings.shouldBe.list(name)
      : strings.settings.shouldBeListOf[kind](name);
  }
  return strings.settings.shouldBe[jsonKind(fallback)](name);
}

function sameKind(name: string, fallback: unknown, value: unknown): boolean {
  if (Array.isArray(fallback)) {
    const kind = itemKind(name, fallback);
    return (
      Array.isArray(value) &&
      (kind === undefined || value.every((item) => jsonKind(item) === kind))
    );
  }
  return (
    !Array.isArray(value) &&
    isObject(value) === isObject(fallback) &&
    typeof value === typeof fallback
  );
}

const choices: ReadonlyMap<string, readonly string[]> = new Map([
  ...toolSettingChoices,
  ['theme', themes],
  ['editor.endOfLine', editorEndings],
  ['editor.charset', editorCharsets],
  ['editor.indentStyle', indentStyles],
]);

const themed = /^(?:colors|fonts|sizes|tools\.[^.]+\.colors)\./;

const closers: Readonly<Record<string, string>> = { '(': ')', '[': ']' };

const readsPastValue = /[\\\p{Cc}]|\/\*/u;

function isCssValue(text: string): boolean {
  if (readsPastValue.test(text)) {
    return false;
  }
  const open: string[] = [];
  let quote: string | undefined;
  for (const character of text) {
    if (quote !== undefined) {
      quote = character === quote ? undefined : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character in closers) {
      open.push(closers[character]);
    } else if (character === ')' || character === ']') {
      if (open.pop() !== character) {
        return false;
      }
    } else if (character === ';' || character === '{' || character === '}') {
      return false;
    }
  }
  return quote === undefined && open.length === 0;
}

function itemProblems(template: Json, item: unknown, name: string): Sentence[] {
  if (!isObject(item)) {
    return [strings.settings.shouldBe.object(name)];
  }
  const unknown = Object.keys(item)
    .filter((key) => !Object.hasOwn(template, key))
    .map((key) => strings.settings.unknown(`${name}.${key}`));
  const known = Object.entries(template).flatMap(([key, fallback]) => {
    const inner = `${name}.${key}`;
    if (!Object.hasOwn(item, key)) {
      return [strings.settings.missing(inner)];
    }
    const value = item[key];
    const standIns = toolSettingStandIns.get(
      inner.replaceAll(/\[\d+\]/g, '[]'),
    );
    if (standIns?.some((standIn) => standIn === value)) {
      return [];
    }
    if (!sameKind(inner, fallback, value)) {
      return [
        standIns === undefined
          ? wrongKind(inner, fallback)
          : strings.settings.shouldBeListOrOneOf(inner, standIns),
      ];
    }
    return isObject(fallback) ? itemProblems(fallback, value, inner) : [];
  });
  return [...known, ...unknown];
}

function listProblems(
  template: Json,
  value: unknown,
  name: string,
  fallback: unknown,
): Sentence[] {
  return Array.isArray(value)
    ? value.flatMap((item, index) =>
        itemProblems(template, item, `${name}[${index}]`),
      )
    : [wrongKind(name, fallback)];
}

function merge<T extends object>(
  defaults: T,
  overrides: Json,
  prefix: string,
  problems: Sentence[],
): T {
  const fallbacks: Json = Object.fromEntries(Object.entries(defaults));
  const accepted: Json = {};
  for (const [key, value] of Object.entries(overrides)) {
    const name = `${prefix}${key}`;
    if (!Object.hasOwn(fallbacks, key)) {
      problems.push(strings.settings.unknown(name));
      continue;
    }
    const fallback = fallbacks[key];
    const allowed = choices.get(name);
    const template: unknown = Array.isArray(fallback) ? fallback[0] : undefined;
    if (isObject(template)) {
      const issues = listProblems(template, value, name, fallback);
      if (issues.length > 0) {
        problems.push(...issues);
      } else {
        accepted[key] = value;
      }
    } else if (!sameKind(name, fallback, value)) {
      problems.push(wrongKind(name, fallback));
    } else if (allowed && !allowed.some((choice) => choice === value)) {
      problems.push(strings.settings.shouldBeOneOf(name, allowed));
    } else if (
      typeof value === 'string' &&
      themed.test(name) &&
      !isCssValue(value)
    ) {
      problems.push(strings.settings.notCssValue(name));
    } else if (isObject(fallback) && isObject(value)) {
      accepted[key] = merge(fallback, value, `${name}.`, problems);
    } else {
      accepted[key] = value;
    }
  }
  return { ...defaults, ...accepted };
}

export function mergeSettings<T extends object>(
  defaults: T,
  overrides: unknown,
): { settings: T; problems: Sentence[] } {
  const problems: Sentence[] = [];
  if (!isObject(overrides)) {
    return {
      settings: defaults,
      problems: [strings.settings.notObject],
    };
  }
  const settings = merge(defaults, overrides, '', problems);
  return { settings, problems };
}

function valueAt(json: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>(
    (value, key) => (isObject(value) ? value[key] : undefined),
    json,
  );
}

function withValue(json: Json, keys: readonly string[], value: unknown): Json {
  const [key, ...rest] = keys;
  if (key === undefined) {
    return json;
  }
  const result = { ...json };
  const inner =
    rest.length === 0
      ? value
      : withValue(isObject(json[key]) ? json[key] : {}, rest, value);
  if (
    inner === undefined ||
    (isObject(inner) && Object.keys(inner).length === 0)
  ) {
    delete result[key];
  } else {
    result[key] = inner;
  }
  return result;
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

const gitSettingsOfVersion22 = [
  'collapseMerges',
  'showAllFiles',
  'ignoreWhitespace',
  'diffLayout',
  'solo',
  'autoFetch',
  'autoFetchMinutes',
  'hideDimmedButtons',
  'columnWidths',
];

const textSettingsOfVersion22 = ['wordWrap', 'showWhitespace'];

const changeColorsOfVersion22 = [
  'added',
  'added-line',
  'added-row',
  'added-minimap',
  'deleted',
  'deleted-line',
  'deleted-row',
  'deleted-minimap',
  'modified',
  'renamed',
];

const bubbleColorsOfVersion22 = [
  'bubble',
  'bubble-foreground',
  'bubble-border',
  'bubble-checked-out',
  'bubble-checked-out-foreground',
  'bubble-checked-out-border',
];

const chartColorOfVersion22 = 'chart-';

type Move = readonly [
  from: readonly string[],
  to: readonly string[] | undefined,
];

function colorMoveOfVersion22(theme: string, name: string): Move | undefined {
  const from = ['colors', theme, name];
  if (changeColorsOfVersion22.includes(name)) {
    return [from, ['colors', theme, `change-${name}`]];
  }
  if (bubbleColorsOfVersion22.includes(name)) {
    return [from, ['tools', 'git', 'colors', theme, name]];
  }
  if (name.startsWith(chartColorOfVersion22)) {
    const color = name.slice(chartColorOfVersion22.length);
    return [from, ['tools', 'git', 'colors', theme, `graph-${color}`]];
  }
  return undefined;
}

const settingMovesOfVersion22: readonly Move[] = [
  ...gitSettingsOfVersion22.map((key): Move => [[key], ['tools', 'git', key]]),
  [['entireFilePinned'], ['tools', 'git', 'showEntireFile']],
  ...textSettingsOfVersion22.map((key): Move => [[key], ['text', key]]),
  [['autoSortTabs'], undefined],
];

function movesOfVersion22(json: Json): Move[] {
  const colors = isObject(json.colors) ? json.colors : {};
  return [
    ...settingMovesOfVersion22,
    ...Object.entries(colors).flatMap(([theme, named]) =>
      isObject(named)
        ? Object.keys(named).flatMap((name) => {
            const move = colorMoveOfVersion22(theme, name);
            return move === undefined ? [] : [move];
          })
        : [],
    ),
  ];
}

function migratedSettings(json: Json): Json | undefined {
  const moves = movesOfVersion22(json).filter(
    ([from]) => valueAt(json, from) !== undefined,
  );
  if (moves.length === 0) {
    return undefined;
  }
  return moves.reduce((result, [from, to]) => {
    const without = withValue(result, from, undefined);
    return to === undefined || valueAt(result, to) !== undefined
      ? without
      : withValue(without, to, valueAt(json, from));
  }, json);
}

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

export function readText(file: string): string | Error | undefined {
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

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function watchSettings(
  file: string,
  onChange: () => void,
  delay = 200,
  target = realPath(file),
): () => void {
  let timer: NodeJS.Timeout | undefined;
  const watchers = [...new Set([file, target])].map((watched) => {
    const folder = path.dirname(watched);
    let stamp = stampOf(watched);
    const watcher = fs.watch(folder, (_event, name) => {
      if (!fs.existsSync(folder)) {
        watcher.close();
        return;
      }
      const now = stampOf(watched);
      if (name === path.basename(watched) || now !== stamp) {
        stamp = now;
        clearTimeout(timer);
        timer = setTimeout(onChange, delay);
      }
    });
    watcher.on('error', () => watcher.close());
    return watcher;
  });
  timer = setTimeout(onChange, delay);
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

function stampOf(file: string): string | undefined {
  try {
    const stats = fs.statSync(file);
    return `${stats.size}:${stats.mtimeMs}`;
  } catch {
    return undefined;
  }
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
  const target = await linkedFile(file);
  const temporary = `${target}.tmp`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  try {
    const handle = await fs.promises.open(temporary, 'w');
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameRetrying(temporary, target, retryDelays);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function linkedFile(file: string): Promise<string> {
  try {
    return await fs.promises.realpath(file);
  } catch (error) {
    const link = isMissing(error)
      ? await fs.promises.readlink(file).catch(() => undefined)
      : undefined;
    return link === undefined
      ? file
      : linkedFile(path.resolve(path.dirname(file), link));
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

export function writeReadOnly(file: string, text: string): void {
  if (fs.existsSync(file)) {
    fs.chmodSync(file, 0o644);
  }
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o444);
}
