import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { tools } from '../shell/shared/tools';
import { defaultSettings } from './fixtures';

const source = path.join(__dirname, '..');

const sourceFiles = fs
  .readdirSync(source, { recursive: true, encoding: 'utf8' })
  .map((file) => file.replaceAll('\\', '/'))
  .filter(
    (file) =>
      !file.startsWith('test/') && /\.(ts|tsx|css|html|json)$/.test(file),
  );

function importsOf(file: string): string[] {
  const text = fs.readFileSync(path.join(source, file), 'utf8');
  return [...text.matchAll(/from '(\.{1,2}\/[^']+)'/g)].map(([, spec]) =>
    path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)),
  );
}

function toolOf(file: string): string | undefined {
  return /^tools\/([^/]+)\//.exec(file)?.[1];
}

const registries = ['shell/shared/tools.ts', 'shell/page/tools.tsx'];

suite('Architecture', () => {
  test('keeps each source file in the folder of its feature, the shell or a tool, by where it runs, or in main, ui or shared', () => {
    const placed =
      /^(?:(?:shell|tools\/[^/]+)\/(?:main|page|shared)\/.+|(?:main|ui|shared)\/[^/]+)$/;
    assert.deepStrictEqual(
      sourceFiles.filter((file) => !placed.test(file)),
      [],
    );
  });

  test('gives each tool a folder of its own, and no folder to anything else', () => {
    assert.deepStrictEqual(
      fs.readdirSync(path.join(source, 'tools')).toSorted(),
      [...tools].toSorted(),
    );
  });

  test('lets no tool import another', () => {
    assert.deepStrictEqual(
      sourceFiles.flatMap((file) => {
        const own = toolOf(file);
        return own === undefined
          ? []
          : importsOf(file)
              .filter((target) => ![undefined, own].includes(toolOf(target)))
              .map((target) => `${file} -> ${target}`);
      }),
      [],
    );
  });

  test('lets the shell, ui and shared reach the tools only through the registries of the shell, as the app starts them', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => /^(?:shell|ui|shared)\//.test(file))
        .filter((file) => !registries.includes(file))
        .flatMap((file) =>
          importsOf(file)
            .filter((target) => toolOf(target) !== undefined)
            .map((target) => `${file} -> ${target}`),
        ),
      [],
    );
  });

  test('keeps the settings of each tool under tools, by its id', () => {
    const settings = defaultSettings();
    assert.deepStrictEqual(
      Object.keys(settings.tools).toSorted(),
      [...tools].toSorted(),
    );
    assert.deepStrictEqual(
      tools.filter((tool) => Object.hasOwn(settings, tool)),
      [],
    );
  });
});
