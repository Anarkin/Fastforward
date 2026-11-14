import * as fs from 'node:fs';
import {
  toolSettingChoices,
  toolSettingListKinds,
  toolSettingStandIns,
  type ThemeColors,
  type ToolSettings,
} from '../shared/tools';
import { strings, type Sentence } from '../../lib/shared/strings';
import {
  editorCharsets,
  editorEndings,
  indentStyles,
  type EditorSettings,
} from './editorSettings';
import { themes, type Theme } from '../shared/protocol';
import { type ImageView, type TextView } from '../shared/views';
import { cursorStyles, type CursorLook } from '../../lib/shared/cursorSettings';
import { isObject, type Json } from '../../lib/main/json';

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
  readonly cursor: CursorLook;
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
  ['cursor.style', cursorStyles],
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

export function merge<T extends object>(
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

export function valueAt(json: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>(
    (value, key) => (isObject(value) ? value[key] : undefined),
    json,
  );
}

export function withValue(
  json: Json,
  keys: readonly string[],
  value: unknown,
): Json {
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

export function same(a: unknown, b: unknown): boolean {
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
