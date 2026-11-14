import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fileColorProblems } from '../../../../../tools/commander/shared/settings';
import { strings } from '../../../../../lib/shared/strings';

const colors = { light: '#000', dark: '#fff' };

suite('Commander settings', () => {
  test('names an extension a color group lists that an earlier one lists already, by the case and dot it is read in, and an empty one', () => {
    assert.deepStrictEqual(
      fileColorProblems([
        { extensions: ['exe', 'jpg'], colors },
        { extensions: ['.JPG', 'md', 'md'], colors },
        { extensions: ['Exe', '.', ''], colors },
      ]),
      [
        strings.settings.fileColorTwice('jpg', 0, 1),
        strings.settings.fileColorTwice('exe', 0, 2),
        strings.settings.fileColorEmpty(2),
        strings.settings.fileColorEmpty(2),
      ],
    );
  });

  test('names a color group of the languages after an earlier one', () => {
    assert.deepStrictEqual(
      fileColorProblems([
        { extensions: 'languages', colors },
        { extensions: ['md'], colors },
        { extensions: 'languages', colors },
      ]),
      [strings.settings.fileColorLanguagesTwice(0, 2)],
    );
  });

  test('names a color group of the executables after an earlier one', () => {
    assert.deepStrictEqual(
      fileColorProblems([
        { extensions: 'executables', colors },
        { extensions: 'languages', colors },
        { extensions: 'executables', colors },
      ]),
      [strings.settings.fileColorExecutablesTwice(0, 2)],
    );
  });

  test('finds nothing to say about color groups that each list their own extensions', () => {
    assert.deepStrictEqual(
      fileColorProblems([
        { extensions: ['exe'], colors },
        { extensions: ['md', 'txt'], colors },
      ]),
      [],
    );
  });
});
