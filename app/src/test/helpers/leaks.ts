import { builtinModules, createRequire } from 'node:module';

export interface State {
  readonly globals: ReadonlyMap<string, unknown>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly folder: string;
  readonly builtins: ReadonlyMap<string, unknown>;
}

const vitestOwn = /^__vitest|^__VITEST|^__vite_/;

const setByLibrariesOnImport = new Set([
  'pdfjsLib',
  'pdfjsViewer',
  '_pdfjsTestingUtils',
]);

function valueOf(owner: object, key: string): unknown {
  const described = Object.getOwnPropertyDescriptor(owner, key);
  return described === undefined
    ? undefined
    : 'value' in described
      ? described.value
      : Reflect.get(described, 'get');
}

function globalsNow(): Map<string, unknown> {
  return new Map(
    Object.getOwnPropertyNames(globalThis)
      .filter(
        (name) => !vitestOwn.test(name) && !setByLibrariesOnImport.has(name),
      )
      .map((name) => [name, valueOf(globalThis, name)]),
  );
}

const warnWhenLoaded = new Set(['punycode', 'sys', 'wasi']);

const watchedBuiltins = builtinModules.filter(
  (name) =>
    !name.startsWith('_') &&
    !name.includes('/internal') &&
    !warnWhenLoaded.has(name),
);

function builtinsNow(): Map<string, unknown> {
  const exports = new Map<string, unknown>();
  for (const name of watchedBuiltins) {
    const loaded: unknown = process.getBuiltinModule(`node:${name}`);
    if (typeof loaded !== 'object' || loaded === null) {
      continue;
    }
    for (const key of Object.keys(loaded)) {
      const described = Object.getOwnPropertyDescriptor(loaded, key);
      if (described !== undefined && 'value' in described) {
        exports.set(`${key} of node:${name}`, described.value);
      }
    }
  }
  return exports;
}

function environmentNow(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).map(([name, value]) => [
      process.platform === 'win32' ? name.toUpperCase() : name,
      value,
    ]),
  );
}

export function stateNow(): State {
  return {
    globals: globalsNow(),
    environment: environmentNow(),
    folder: process.cwd(),
    builtins: builtinsNow(),
  };
}

function changed(
  before: ReadonlyMap<string, unknown>,
  now: ReadonlyMap<string, unknown>,
): string[] {
  return [...new Set([...before.keys(), ...now.keys()])]
    .filter((key) => !Object.is(before.get(key), now.get(key)))
    .toSorted();
}

const load = createRequire(__filename);

function actLeftOpen(): boolean {
  const react: unknown = load('react');
  const internals: unknown = Reflect.get(
    Object(react),
    '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE',
  );
  return (
    typeof internals === 'object' &&
    internals !== null &&
    Reflect.get(internals, 'actQueue') !== null
  );
}

export function leaksSince(before: State): string[] {
  const now = stateNow();
  const environment = [
    ...new Set([
      ...Object.keys(before.environment),
      ...Object.keys(now.environment),
    ]),
  ]
    .filter((name) => before.environment[name] !== now.environment[name])
    .toSorted();
  return [
    ...changed(before.globals, now.globals).map((name) => `the global ${name}`),
    ...environment.map((name) => `the environment variable ${name}`),
    ...(before.folder === now.folder ? [] : ['the working folder']),
    ...(actLeftOpen() ? ['an act of React, never awaited'] : []),
    ...[...before.builtins.keys()]
      .filter(
        (key) => !Object.is(before.builtins.get(key), now.builtins.get(key)),
      )
      .toSorted(),
  ];
}
