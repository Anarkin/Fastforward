import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { nameProblem } from '../../../../tools/commander/shared/names';
import { strings } from '../../../../lib/shared/strings';

suite('Commander names', () => {
  test('takes a name of one folder, never one reaching another folder through a separator, nor . or ..', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      assert.strictEqual(nameProblem('photos 2024', platform), undefined);
      assert.strictEqual(nameProblem('.config', platform), undefined);
      assert.strictEqual(nameProblem('.', platform), strings.commander.dotName);
      assert.strictEqual(
        nameProblem('..', platform),
        strings.commander.dotName,
      );
      assert.ok(nameProblem('a/b', platform) !== undefined, platform);
      assert.strictEqual(nameProblem('', platform), strings.commander.noName);
    }
    assert.ok(nameProblem('a\\b', 'win32') !== undefined);
    assert.strictEqual(nameProblem('a\\b', 'linux'), undefined);
  });

  test('takes no name Windows refuses: one with a character it keeps for itself, a name it keeps for a device, or one ending in a dot or a space', () => {
    for (const name of [
      'a:b',
      'a*b',
      'a?b',
      'a"b',
      'a<b',
      'a>b',
      'a|b',
      'a\tb',
    ]) {
      assert.deepStrictEqual(
        nameProblem(name, 'win32'),
        strings.commander.nameCantHold('\\ / : * ? " < > |'),
        name,
      );
      assert.strictEqual(nameProblem(name, 'linux'), undefined, name);
    }
    for (const name of ['CON', 'nul', 'Com1', 'lpt9.txt', 'aux.tar.gz']) {
      assert.deepStrictEqual(
        nameProblem(name, 'win32'),
        strings.commander.reservedName(name),
        name,
      );
    }
    assert.strictEqual(nameProblem('console', 'win32'), undefined);
    assert.strictEqual(
      nameProblem('name.', 'win32'),
      strings.commander.nameEnd,
    );
    assert.strictEqual(
      nameProblem('name ', 'win32'),
      strings.commander.nameEnd,
    );
    assert.strictEqual(nameProblem('name.', 'darwin'), undefined);
  });
});
