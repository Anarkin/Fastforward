import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { newFolderProblem } from '../../../../tools/commander/page/naming';
import { strings } from '../../../../shared/strings';

const entry = (name: string) => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

suite('Commander naming', () => {
  test('says a name is there already when the side lists it, by case on Windows and macOS as their file systems do', () => {
    const listed = [entry('Photos'), entry('notes.txt')];
    assert.strictEqual(
      newFolderProblem('photos', listed, 'win32'),
      strings.commander.nameTaken('photos'),
    );
    assert.strictEqual(
      newFolderProblem('PHOTOS', listed, 'darwin'),
      strings.commander.nameTaken('PHOTOS'),
    );
    assert.strictEqual(newFolderProblem('photos', listed, 'linux'), undefined);
    assert.strictEqual(newFolderProblem('new', listed, 'win32'), undefined);
  });

  test('says what is wrong with a name before whether it is there', () => {
    assert.strictEqual(
      newFolderProblem('con', [entry('con')], 'win32'),
      strings.commander.reservedName('con'),
    );
    assert.strictEqual(
      newFolderProblem('', [], 'linux'),
      strings.commander.noName,
    );
  });
});
