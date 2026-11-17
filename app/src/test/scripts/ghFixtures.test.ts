import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { searchedWithoutGh } from './ghFixtures';

const joined = (...folders: string[]) => folders.join(path.delimiter);

suite('A script run without a gh that works', () => {
  test('finds a gh that says at once it is not signed in before any other, where a script can stand in for it', () => {
    assert.strictEqual(
      searchedWithoutGh(joined('bin', 'tools'), 'shim', () => true, false),
      joined('shim', 'bin', 'tools'),
    );
  });

  test('finds no gh on Windows, where only a program can stand in for it, leaving out the folders that hold it, but for one that holds git or node too, which the script needs', () => {
    const holding: Readonly<Record<string, readonly string[]>> = {
      cli: ['gh'],
      shims: ['gh', 'git'],
      node: ['node'],
    };
    assert.strictEqual(
      searchedWithoutGh(
        joined('cli', 'shims', 'node', 'system'),
        'shim',
        (folder, program) => (holding[folder] ?? []).includes(program),
        true,
      ),
      joined('shims', 'node', 'system'),
    );
  });
});
